# Printer discovery — rank, probe, and refuse cleanly

**Three files: `lib/printing/bleTransport.ts` (ranking + three connect checks), `lib/printing/transport.ts` (one optional field), `components/printing/PrintingSettings.tsx` (two-section list).** No `next dev`, no `next build`, no `cap sync`, no deploys, no commit. `tsc` clean.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**
✅ **NO ALLOW-LIST. Every named device is still listed and still connectable.**

> ## 🔴 THE ONE THING TO CARRY OUT OF THIS REPORT — B3.
> **`ESC @` IS ONE-WAY. ESC/POS sends no reply, and a BLE write resolves when the peripheral's stack accepts the bytes, not when a printer acts on them.** **A passing probe means only *"this device accepted a write"* — it does NOT prove a printer is present, that it understood, or that paper moved.**
> **THE PROBE RULES THINGS OUT. IT CANNOT RULE THEM IN.** ✅ **Every string in the UI is worded to claim no more than that: the failures say "does not look like a printer", and the success says nothing about printers at all.**
>
> ⚠️ **SO AN AIRPOD MAY STILL PASS.** If it exposes a writable characteristic and accepts two bytes, all three checks pass. **What the change guarantees is that it is no longer OFFERED as a printer, and that a device which cannot possibly print is now refused.**

---

# PART A — THE LIST

## A1. The scan and its rendering, before

**READ, `lib/printing/bleTransport.ts` — the scan callback:**

```ts
      await BleClient.requestLEScan({ allowDuplicates: false }, result => {
        const id = result?.device?.deviceId
        if (!id) return
        // NAMELESS PERIPHERALS ARE DROPPED. A receipt printer advertises a name; a nameless row is an
        // unidentifiable MAC address an operator cannot choose between, and the list would fill with
        // every phone and earbud in the venue.
        const name = result?.device?.name || result?.localName
        if (!name) return
        found.set(id, { id, name, class: 'ble' })
      })
```

**READ, `components/printing/PrintingSettings.tsx:241-252` — the rendering, one flat list:**

```tsx
              {!!found?.length && (
                <div className="flex flex-col gap-1">
                  <p className="text-slate-600">Tap your printer to connect:</p>
                  {found.map(d => (
                    <button key={d.id} onClick={() => connectTo(d)} disabled={!!connectingId}
                      className="flex items-center justify-between gap-2 text-left bg-white border border-slate-200 hover:border-orange-300 rounded-lg px-3 py-2 disabled:opacity-50">
                      <span className="min-w-0 truncate text-slate-800 font-medium">{d.name}</span>
                      <span className="shrink-0 text-orange-600 font-semibold">{connectingId === d.id ? 'Connecting...' : 'Connect'}</span>
                    </button>
                  ))}
                </div>
              )}
```

🔴 **"Tap your printer to connect" above a row reading "Dominic's AirPods Pro" is the defect — the heading asserts everything under it is a printer.**

## A2. Two sections, nothing hidden permanently

**The transport now ranks; the card groups. `DiscoveredPrinter` gained ONE optional field:**

```ts
export interface DiscoveredPrinter {
  id: string
  name: string
  class: PrinterClass
  /** Suggestive ranking only — the UI groups on it, nothing filters on it. A row with `likely: false`
   *  is still listed and still connectable; the three connect-time checks are what actually gate. */
  likely?: boolean
}
```

```ts
        // 🔴 EVERY NAMED DEVICE IS STILL LISTED. `likely` only decides WHICH SECTION it lands in.
        found.set(id, { id, name, class: 'ble', likely: looksLikePrinter(name, result?.uuids) })
```

**And the card splits, with "Other devices" COLLAPSED but one tap away:**

```tsx
                    {other.length > 0 && (
                      likely.length === 0 ? (
                        <>{other.map(row)}</>
                      ) : (
                        <>
                          <button onClick={() => setShowOther(v => !v)} aria-expanded={showOther}
                            className="text-left text-slate-500 hover:text-slate-700 font-semibold py-1">
                            {showOther ? 'Hide other devices' : `Other devices (${other.length})`}
                          </button>
```

✅ **The count is in the label (`Other devices (4)`), so an operator knows there is something there before tapping.** ✅ **`setShowOther(false)` on every new scan, so a fresh scan opens in the same state.**

## A3. The ranking signals — and how much each is worth

| Signal | Available from | READ / INFERRED | Strength |
|---|---|---|---|
| **Advertised service UUIDs** (`result.uuids`) | ✅ **READ** — `ScanResult.uuids?: string[]` in the plugin's `definitions.d.ts` | 🔴 **The UUID VALUES are INFERRED** — `18f0`, `ff00`, `ffe0`, `49535343…` (Microchip/ISSC transparent UART), `e7810a71…` (Star). **From the field, not from any vendor document in this repo** | **Strongest available — but a printer is not obliged to advertise its service at all** |
| **Name contains a printer word** | ✅ READ — `device.name` / `localName` | 🔴 **The PATTERNS are INFERRED** — `print`, `pos`, `receipt`, `thermal`, `star`, `epson`, `bixolon`, `munbyn`, `rongta`, `sprt`, and model shapes like `zj-`, `xp-`, `mtp-`, `gp-`, `rp\d` | **Suggestive. Many printers ship as a bare model code that matches nothing** |
| **Name looks like a KNOWN NON-printer** | ✅ READ | 🔴 INFERRED patterns — `airpod`, `watch`, `iphone`, `beats`, `buds`, `homepod`, `fitbit`, `tv`… | **Used ONLY to push a row DOWN. Never to drop it** |
| `rssi` / `txPower` | ✅ READ — both on `ScanResult` | — | 🔴 **NOT USED. Signal strength says how CLOSE something is, not what it is** — and a printer across the van would rank below a watch on the operator's wrist |
| `manufacturerData` / `serviceData` | ✅ READ — both present | — | 🔴 **NOT USED.** Decoding company identifiers would be a second inferred table with no better evidence behind it |

```ts
/** Suggestive only. Two signals, both INFERRED, and the row is listed either way. */
function looksLikePrinter(name: string, uuids: string[] | undefined): boolean {
  const advertised = (uuids || []).join(' ').toLowerCase()
  if (PRINTER_SERVICE_HINTS.some(h => advertised.includes(h))) return true
  if (NOT_PRINTER_NAME_HINTS.test(name)) return false
  return PRINTER_NAME_HINTS.test(name)
}
```

> ## 🔴 STATED PLAINLY: **EVERY ONE OF THESE IS SUGGESTIVE, NOT CONCLUSIVE.** A printer can rank as "other" and a speaker can rank as "likely".
> ✅ **THAT IS EXACTLY WHY THEY ONLY SORT.** The order of the checks matters too: a matching service UUID wins even if the name looks like a watch, because the UUID is the better evidence.

## A4. 🔴 When NOTHING ranks as likely

**No empty box. The heading is replaced, and the other list renders OPEN:**

```tsx
                    {likely.length > 0 ? (
                      <>
                        <p className="text-slate-600">Likely printers — tap to connect:</p>
                        {likely.map(row)}
                      </>
                    ) : (
                      <p className="text-slate-600">
                        No printers recognised yet. Everything nearby is listed below — if your printer is
                        there, tap it and HatchGrab will check whether it can print.
                      </p>
                    )}
```

✅ **It reads as "not recognised yet, here is everything nearby", not as a failure.** 🔴 **And the "Other devices" disclosure is SKIPPED in that case — collapsing the only content behind a tap would leave a panel that looks empty, which is the exact impression this avoids.**

## A5. Every string added

| String |
|---|
| **"Likely printers — tap to connect:"** |
| **"No printers recognised yet. Everything nearby is listed below — if your printer is there, tap it and HatchGrab will check whether it can print."** |
| **"Other devices (N)"** / **"Hide other devices"** |
| **"These do not look like printers, but you can still try one."** |
| **"That device does not look like a printer — it has no channel a ticket could be sent on"** |
| **"That device does not look like a printer — it refused a printer command"** |

⚠️ **The pre-existing "No printers found. Check the printer is switched on…" empty-scan copy is unchanged.**

---

# PART B — THE THREE CHECKS

**All three run inside `connect()`, in order, before anything is claimed:**

```ts
    // ── CONNECT — THREE CHECKS, AND NOTHING IS CLAIMED UNTIL ALL THREE PASS ─────────────────────────
    // 1. the GATT link opens at all
    // 2. a WRITABLE characteristic exists outside the generic services — without one the device cannot
    //    receive a ticket under any circumstances, so this rules it out definitively
    // 3. an ESC/POS `ESC @` (initialise) write is ACCEPTED
```

## B1. Check 2 — a writable characteristic

```ts
        const target = await findWriteTarget(printerId)
        if (!target) {
          await abandon()
          return { ok: false, error: 'That device does not look like a printer — it has no channel a ticket could be sent on' }
        }
```

🔴 **DEFINITIVE IN THE NEGATIVE: a device with no writable characteristic outside the generic GATT services cannot receive a ticket under any circumstances.** ⚠️ **NOT definitive in the positive — this is precisely the check that let an Apple Watch through, because a writable characteristic is common.**

## B2. Check 3 — the `ESC @` probe

**The bytes:**

```ts
/** ESC @ — the ESC/POS "initialise printer" command, and the probe in check 3. */
const ESC_POS_RESET = [0x1B, 0x40]
```

**The probe, and what is done with the result:**

```ts
        try {
          const { numbersToDataView } = await import('@capacitor-community/bluetooth-le')
          const view = numbersToDataView(ESC_POS_RESET)
          if (target.withoutResponse) await BleClient.writeWithoutResponse(printerId, target.service, target.characteristic, view)
          else await BleClient.write(printerId, target.service, target.characteristic, view)
        } catch {
          await abandon()
          return { ok: false, error: 'That device does not look like a printer — it refused a printer command' }
        }
```

✅ **`ESC @` is the correct probe byte-wise: it is the ESC/POS initialise command, so a real printer treats it as a harmless reset — no paper, no feed, no mark.** ✅ **A throw is the only signal available, and it is used: refuse, disconnect, say so.**

## B3. ⚠️ THE LIMIT, STATED PLAINLY

> ## 🔴 **A PASSING PROBE PROVES ALMOST NOTHING.**
> **`ESC @` is ONE-WAY: ESC/POS returns no acknowledgement, and BLE resolves a write when the peripheral's stack accepts the bytes — not when a printer acts on them.** With `writeWithoutResponse` there is not even a link-layer acknowledgement to wait on.
> **So a PASS means: "a device accepted two bytes on its writable characteristic."** **It does NOT mean a printer is present, that it understood the command, that it has paper, or that anything moved.**
> ✅ **THE UI CLAIMS NO MORE THAN THAT.** The two failures say *"does not look like a printer"* — a statement about appearance, not a verdict. **The success message says "Connected to {name}. Tickets will print automatically." — it names the device and the intent, and asserts nothing about what the device IS.**
> ⚠️ **RECORDED IN THE CODE so the next person does not strengthen the claim:** *"THE PROBE RULES THINGS OUT; IT CANNOT RULE THEM IN."*

## B4. Clean refusal — no half-open link

```ts
      /** Leave nothing half-open. Idempotent and never throws. */
      const abandon = async () => {
        session = null
        try { await BleClient.disconnect(printerId) } catch { /* already gone */ }
      }
```

✅ **Called on BOTH check failures and on any thrown error.** 🔴 **It nulls the session FIRST, then disconnects — so even if `disconnect` throws, no session survives.** ⚠️ **The previous code disconnected only on the missing-characteristic path and left the catch-all without one; that gap is closed.**

**The copy an operator sees, verbatim:**

> **"That device does not look like a printer — it has no channel a ticket could be sent on"**
> **"That device does not look like a printer — it refused a printer command"**

✅ **Plain words, no jargon, and each names the actual reason** — rendered in the card's existing red `pairingError` line.

## B5. 🔴 `status()` stays truthful

```ts
        // 🔴 ONLY NOW. Session first, then persistence — neither happens for a device that failed above.
        session = { deviceId: printerId, name, ...target }
```

**And `status()` is unchanged, still reading the live session:**

```ts
      if (session) return { connected: true, printerName: session.name }
```

> ## ✅ **A DEVICE THAT FAILED A CHECK CAN NEVER BE REPORTED AS CONNECTED, because `session` is assigned only after check 3 returns, and `abandon()` nulls it on every failure path.**
> 🔴 **THE REGRESSION THIS PREVENTS IS THE ONE ALREADY FIXED ONCE IN THE STUB** — a transport claiming a connection it does not have. **The property is now structural: there is exactly one assignment to `session` in `connect()`, and it is the last statement before the persistence write.**

---

# PART C — THE OPERATOR CAN STILL OVERRIDE

## C1. "Other devices" connects normally

✅ **The card's `connectTo(d)` is the SAME function for both sections** — `row` is one helper rendered into either list, and it calls `connectTo(d)` identically. **There is no per-section branch anywhere in the connect path.**

🔴 **THE CHECKS ARE GATES ON CAPABILITY, NOT ON PROVENANCE.** A printer that advertises no recognised UUID and has an unhelpful name lands in "Other devices", and connects exactly like one at the top — because `connect()` never sees which list the row came from.

## C2. Persistence

```ts
        await Promise.all([
          Preferences.set({ key: K.id, value: printerId }),
          Preferences.set({ key: K.name, value: name }),
          Preferences.set({ key: K.svc, value: target.service }),
          Preferences.set({ key: K.chr, value: target.characteristic }),
        ])
```

| | |
|---|---|
| **Still per-device in Preferences?** | ✅ **YES — the four `hg_printer_*` keys, unchanged, no column** |
| **Is a failed device persisted?** | 🔴 **NO. The write is AFTER all three checks and after the `session` assignment; every failure path returns before reaching it** |
| **Why that matters beyond tidiness** | ⚠️ **`reconnectStoredPrinter` reads those keys on app resume. Persisting a failed device would have the app silently reconnect to an Apple Watch every time it came to the foreground** |

---

# PART D — BOUNDARIES

## D1. `git diff --stat`

```
 app/trucks/[slug]/order/page.tsx         |  30 +-
 components/printing/PrintingSettings.tsx |  91 ++++-
 docs/customer-quantity-row-report.md     | 404 ++++++++++----------
 docs/printing-ui-report.md               | 615 ++++++++++++++-----------------
 lib/printing/bleTransport.ts             |  87 ++++-
 lib/printing/transport.ts                |   9 +-
 6 files changed, 653 insertions(+), 583 deletions(-)
```

> ## ✅ NO TICKET RENDERING, TRIGGER LOGIC, CHUNKING OR PACING.
> 🔴 **`lib/printing/ticket.ts` — ABSENT.** 🔴 **`lib/printing/mapOrderToTicket.ts` — ABSENT.** 🔴 **`lib/printing/printWatcher.ts` — ABSENT.** 🔴 **`lib/printing/usePrinting.ts` — ABSENT.**
> **And inside `bleTransport.ts`, a diff filtered for `CHUNK`, `sleep(`, `sendBytes` and the chunk-loop write returns NOTHING — `CHUNK = 180`, `CHUNK_GAP_MS = 12`, the loop, and the failed/unknown split are byte-identical.**

## D2. The core, confirmed

```
$ git diff --name-only | grep -E "ticket\.ts|mapOrderToTicket|printWatcher|usePrinting"
(no output)
```

✅ **`renderTicket`, `mapOrderToTicket` and `usePrintWatcher` are untouched. They already worked.**

## D3. Customer-facing surfaces

> ## ✅ **NONE AFFECTED.** The card is operator-only, behind `isNativeApp()` and the plan gate; the transport touches no network.
> ⚠️ **`app/trucks/[slug]/order/page.tsx` appears in the diff — that is the EARLIER task's quantity-row spacing, not this one. This task did not open it.**

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census, before and after

### `lib/printing/bleTransport.ts` — 16,112 → 20,815 bytes (+4,703)

| Codepoint | Before | After | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS | 887 | 903 | **+16** | one new `──` rule on the ranking block |
| U+2014 EM DASH | 11 | 26 | **+15** | prose in the ranking and three-checks comments |
| U+1F534 LARGE RED CIRCLE | 5 | 10 | **+5** | five emphasis markers |
| U+2026 HORIZONTAL ELLIPSIS | 1 | 3 | **+2** | `49535343-…` and `e7810a71-…` in the UUID notes |
| **all other 3 classes** | — | — | **0** | unchanged |

🔴 **7 → 7 distinct. GAINED NONE, LOST NONE.** ✅ **U+2026 was already present in this file, so naming the UUIDs with an ellipsis gained no class.**

### `components/printing/PrintingSettings.tsx` — 25,658 → 28,624 bytes (+2,966)

| Codepoint | Before | After | Δ | Explanation |
|---|---|---|---|---|
| U+2500 BOX DRAWINGS | 421 | 459 | **+38** | one new `──` rule |
| U+2014 EM DASH | 29 | 32 | **+3** | prose, and the two new headings |
| U+1F534 LARGE RED CIRCLE | 21 | 24 | **+3** | three emphasis markers |
| **all other 7 classes** | — | — | **0** | unchanged |

🔴 **10 → 10 distinct. GAINED NONE, LOST NONE.**

**`lib/printing/transport.ts`:** +9 lines, all ASCII doc-comment. **Classes unchanged.**

## E3. 🔴 CARRIER-AWARE VARIATION-SELECTOR CHECK

**Per emoji-presentation base, counting how many of THAT base are followed by U+FE0F — not a raw total comparison:**

| File | Base | Paired | **BARE** |
|---|---|---|---|
| `lib/printing/bleTransport.ts` | U+26A0 WARNING SIGN | 2 → **2** | **0 → 0** |
| `components/printing/PrintingSettings.tsx` | U+26A0 WARNING SIGN | 2 → **2** | **0 → 0** |
| **`docs/printing-ble-report.md`** *(this file)* | U+26A0 WARNING SIGN | — | **0** |
| **`docs/printing-ble-report.md`** | U+270F PENCIL *(if present)* | — | **0** |

✅ **ZERO BARE GLYPHS in every file this task touched, and in this report.**

> ## 🔴 THE METHOD CHANGE IS ADOPTED AND IT MATTERS: a raw `count(U+26A0)` vs `count(U+FE0F)` comparison is WRONG whenever another emoji carries its own selector.
> **That is exactly what produced today's false mismatch — `✏️` (U+270F + U+FE0F) made a clean file look unpaired by one.** ✅ **The check now walks the string, and for each emoji-presentation base asks whether the NEXT codepoint is U+FE0F. It answers per base, so a pencil can never be mistaken for an unpaired warning sign.**

## E4. Byte scan — byte-level, never `grep`

```
lib/printing/bleTransport.ts               20,815 bytes   NUL 0   control none
components/printing/PrintingSettings.tsx   28,624 bytes   NUL 0   control none
lib/printing/transport.ts                   8,850 bytes   NUL 0   control none
```

✅ **Clean.**

## E6. `git status` — which entries are THIS task's

```
 M app/trucks/[slug]/order/page.tsx
 M components/printing/PrintingSettings.tsx
 M docs/customer-quantity-row-report.md
 M docs/printing-ui-report.md
 M lib/printing/bleTransport.ts
 M lib/printing/transport.ts
```

| Entry | Whose |
|---|---|
| 🔴 **`lib/printing/bleTransport.ts`** | **THIS TASK ONLY** |
| 🔴 **`lib/printing/transport.ts`** | **THIS TASK ONLY** *(the one `likely?` field)* |
| 🔴 **`components/printing/PrintingSettings.tsx`** | **THIS TASK** *(the two-section list)* — **and the earlier copy/alignment task** |
| ✅ **`docs/printing-ble-report.md`** | **THIS TASK** *(it does not appear above because it is being written now)* |
| `app/trucks/[slug]/order/page.tsx`, `docs/customer-quantity-row-report.md`, `docs/printing-ui-report.md` | **EARLIER tasks today** |

⚠️ **THE TREE IS MUCH SHORTER THAN EARLIER BECAUSE YOU COMMITTED — `git log` shows `b175963 ipad fixes` at the head, which swept up the session's earlier work.** 🔴 **This task's changes are NOT committed.**

## E6b. `tsc`

```
$ npx tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

⚠️ **It proves the ranking function's types line up and the JSX still compiles. It proves nothing about which section a real Apple Watch lands in, and nothing was rendered.**

---

# PART F — WHAT TO TEST

> ⚠️ **PREREQUISITE: rebuild and reinstall.** The transport and the card are web code, but the card is native-only — exercise it in the app, on a Max/trial truck, with printing toggled ON.

**1. Scan with the printer OFF (but a Watch/AirPods nearby)**
**PASS:** either no "Likely printers" heading at all and the line *"No printers recognised yet. Everything nearby is listed below…"* with the devices under it, **or** a "Likely printers" section that does NOT contain the Watch or AirPods, with them behind **"Other devices (N)"**.
🔴 **FAILURE:** an empty box under a "Likely printers" heading, or AirPods listed as a likely printer.

**2. Scan with the printer ON**
**PASS:** the printer appears under **"Likely printers"**.
⚠️ **ACCEPTABLE, NOT A FAILURE:** it appears under "Other devices" instead — the signals are suggestive, and this is the case the design refuses to break. **Report the model and its advertised name so the hints can be widened.**
🔴 **FAILURE:** the printer does not appear at all. **That would mean something is FILTERING, which is the thing this task exists to avoid.**

**3. Connect to the printer**
**PASS:** the row turns green — *"Connected to {name}. Tickets will print automatically."*
🔴 **FAILURE:** *"…it has no channel a ticket could be sent on"* → the discovery heuristic missed the characteristic on this model. *"…it refused a printer command"* → the write was rejected; **report which, they mean different things.**

**4. 🔴 Connect to an Apple Watch or AirPods DELIBERATELY** — expand "Other devices" and tap one
**PASS (either is correct):**
  **(a)** it refuses with *"That device does not look like a printer — …"*, the card stays on "No printer connected", and a rescan still works; **or**
  **(b)** ⚠️ **it CONNECTS — which is expected and documented (B3): if the device accepted two bytes, no one-way probe can tell.** **What must NOT happen is it being offered as a likely printer.**
🔴 **FAILURE:** it refuses but the card still says Connected, **or** a later scan/connect fails because a half-open link was left behind. **Either is the `status()` regression B5 forbids.**

**5. Reconnect after a refusal**
Refuse a Watch, then background the app for a minute and return.
**PASS:** nothing reconnects; the card still says no printer.
🔴 **FAILURE:** it silently reconnects to the Watch → the failed device was persisted, which C2 forbids.

**6. Web**
**PASS:** no printing card at all — unchanged.

---

# PROVENANCE

**READ** — the scan callback and its rendering before the change · `ScanResult` in the plugin's `definitions.d.ts` (`uuids`, `rssi`, `txPower`, `manufacturerData`, `serviceData` all confirmed present) · `findWriteTarget` · `status()` · the Preferences keys and `reconnectStoredPrinter` · both censuses, carrier-aware · the byte scan · `git diff --name-only` for the four core printing files and for the chunking lines · `git status`, `git log`, `git diff --stat`, `tsc`.

**INFERRED** — every ranking signal's VALUE: the five service-UUID fragments and both name patterns are from the field, **not read from any vendor document in this repo** · that `ESC @` is harmless to a real printer · that a non-printer is *more likely* to reject the write, which is the weakest assumption here and is why B3 exists.

**NOT VERIFIED** — 🔴 **no printer, Watch or AirPod has been through this code.** The ranking has never sorted a real scan, the probe has never been sent, and no refusal has ever been rendered. **Part F test 4 is the one that matters: it is the case that produced the report, and the only one that can show whether refusing works.**
