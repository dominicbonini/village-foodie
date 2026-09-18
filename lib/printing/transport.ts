// ── Printer transport SEAM (class-agnostic) ───────────────────────────────────────────────────────────
// Everything ABOVE this seam is shared + printer-class-agnostic: renderTicket → ESC/POS bytes, the due-time
// scheduler/watcher, dedup, print_jobs, config, and the reprint/flag UX. Printing itself is just
// `sendBytes(bytes)`. In Phase B, TWO backends implement this SAME interface, selected by
// `van_devices.printer_class`:
//   • 'mfi'  — Star/Epson vendor SDK (External Accessory). Real status (paper-out, cover-open), reliable,
//              survives iOS updates. THE RECOMMENDED path for a truck printing all day.
//   • 'ble'  — @capacitor-community/bluetooth-le: write ESC/POS to the printer's characteristic. Works, but
//              LIMITED/NO status + fiddlier reconnect. The budget fallback.
// Because both implement PrinterTransport, supporting both is just the two backends — NOT duplicated logic.
//
// ── WIDENED 15 August 2026 FOR A DEVICE THAT PAIRS, DROPS AND RECONNECTS ────────────────────────────
// The original four methods were shaped for a stub: scan / connect / sendBytes / status, with no way to
// let go of a device, no way to ask whether the radio is even usable, and a `status()` that could only
// describe a connection, never the absence of one. A real Bluetooth printer needs all three, and the
// watcher above needs them BEFORE any backend exists — otherwise the wiring gets built against a shape
// that has to change the day hardware lands, which is the change most likely to break a live kitchen.
// THREE ADDITIONS, and nothing else moved:
//   • `availability()` — can this device print AT ALL? Radio off, permission refused and "this platform has
//     no printer support" are DIFFERENT answers and the UI must be able to say which. A boolean could not.
//   • `disconnect()` — the pairing is device-bound and long-lived; without a release there is no way to
//     switch printers, and no way to end a session that has gone bad.
//   • `PrinterStatus.detail` + `printerName` — so "not connected" can carry a REASON to the operator
//     rather than being a silent false.
// NOTE: `sendBytes` IS UNCHANGED, deliberately. It is the one method the renderer feeds, it already takes the
// exact `Uint8Array` renderTicket emits, and every line of the pipeline above depends on that shape.
//
// ── THE STUB IS NOW HONEST, AND THAT IS A BEHAVIOUR CHANGE, NOT A TIDY ──────────────────────────────
// It used to answer `status() -> { connected: true }` and `sendBytes() -> { ok: true }` unconditionally.
// Wired to a live watcher those two lies become the WORST possible failure: every ticket would be recorded
// as PRINTED SUCCESSFULLY while no paper moved, and the durable printed-set would make that permanent —
// each order marked done, never retried, invisibly missing from the kitchen.
// It now models a device that must be FOUND and then CONNECTED. Nothing can be found (there is no radio
// code), so nothing can be connected, so `sendBytes` refuses. Every layer above sees the truth: the ticket
// is not printed, the order stays due, and the next tick tries again.

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

// 'net' ADDED 17 September 2026 — the wired (network, port 9100) backend, lib/printing/netTransport.ts.
export type PrinterClass = 'mfi' | 'ble' | 'net'

/** The operator's choice of backend, stored per DEVICE in Preferences under PRINTER_KIND_KEY.
 *  🔴 ABSENT MEANS 'ble' — exactly today's selection and today's behaviour. A device that has never
 *  chosen a printer type must never see a new backend. */
export type PrinterKind = 'ble' | 'net'
export const PRINTER_KIND_KEY = 'hg_printer_kind'

// ── 🔴 THE SHELL LOADS THE LIVE SITE, SO OLD BINARIES RUN NEW WEB CODE (17 September 2026) ─────────
// capacitor.config's `server.url` is https://www.hatchgrab.com/app — the native app is a REMOTE-URL
// shell (§36 / V11.3: "a VERCEL DEPLOY IS NOW AN INSTANT CHANGE TO A SHIPPED APP"). The moment this web
// code deploys, every device still running the store build executes it — and those binaries contain NO
// NetPrinterPlugin. Without the check below, such a device could choose Wired, store 'net', build the
// wired transport, and every plugin call would reject with "NetPrinter does not have an implementation"
// — which netTransport.sendBytes turns into a THROW, i.e. outcome 'unknown', i.e. a POSSIBLE DUPLICATE
// banner on a printer that was never even addressable. WIRED MUST NOT EXIST UNTIL THE BINARY HAS IT.
//
// Capacitor.isPluginAvailable(name) is exactly this test. In @capacitor/core 8.4.0 a registered plugin
// carries `platforms: new Set([...Object.keys(jsImplementations), ...(pluginHeader ? [platform] : [])])`
// and the check is `platforms.has(getPlatform()) || getPluginHeader(name)`. Our registration
// (plugins/hatchgrab-net-printer/index.js) supplies only a `web` implementation, so on iOS/Android the
// answer comes solely from PluginHeaders — the list the NATIVE BRIDGE injects for the classes compiled
// into THIS binary. Old binary ⇒ no header ⇒ false. New binary ⇒ header ⇒ true.
// ⚠️ isNativePlatform() is required too: on web `platforms.has('web')` is true (the refusing stub), and
// a browser must never be told the wired backend exists.
/** The name BOTH native classes register under: @CapacitorPlugin(name = "NetPrinter") /
 *  CAPPluginRegistration "NetPrinter", and registerPlugin('NetPrinter') in the JS. */
export const NET_PRINTER_PLUGIN = 'NetPrinter'

/** Is the wired backend present in the RUNNING BINARY? Every wired surface is gated on this. */
export function isNetPrinterAvailable(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(NET_PRINTER_PLUGIN) } catch { return false }
}

export interface PrintResult { ok: boolean; error?: string }

/** Can this device print at all, before any pairing question. Four ANSWERS, not a boolean, because the UI
 *  must be able to tell an operator WHICH wall they hit — "turn Bluetooth on" and "this iPad cannot print"
 *  are different instructions and a false would collapse them. */
export type PrinterAvailability =
  /** A transport exists and the radio is usable. Pairing is a separate question. */
  | 'available'
  /** No backend for this platform/build — Phase A's answer, and the honest one today. */
  | 'unsupported'
  /** The OS refused permission. Recoverable by the operator in device Settings. */
  | 'unauthorised'
  /** Hardware present, radio switched off. Recoverable in one tap. */
  | 'off'

/** Best-effort status. MFi populates paperOut/coverOpen; BLE usually can't → they stay `undefined`. The
 *  reprint/flag UX therefore treats `!connected` OR a failed `sendBytes` as the universal failure signal
 *  (works for both classes); MFi additionally surfaces paperOut/coverOpen when known.
 *  NOTE: `connected: false` MUST be reachable and MUST carry a reason — see the stub note above. */
export interface PrinterStatus {
  connected: boolean
  /** The paired device's name when there is one, for the settings card to display. */
  printerName?: string
  paperOut?: boolean
  coverOpen?: boolean
  /** Operator-facing reason, shown when `connected` is false. Never a stack trace. */
  detail?: string
}

export interface DiscoveredPrinter {
  id: string
  name: string
  class: PrinterClass
  /** Suggestive ranking only — the UI groups on it, nothing filters on it. A row with `likely: false`
   *  is still listed and still connectable; the three connect-time checks are what actually gate. */
  likely?: boolean
}

/** The one seam both Phase-B backends implement. Printer-agnostic + order-agnostic — it only moves bytes. */
export interface PrinterTransport {
  /** Ask before scanning. Cheap, and safe to call on every render of the settings card. */
  availability(): Promise<PrinterAvailability>
  scan(): Promise<DiscoveredPrinter[]>
  connect(printerId: string): Promise<PrintResult>
  /** Release the pairing. Idempotent — calling it when nothing is connected is not an error. */
  disconnect(): Promise<void>
  sendBytes(bytes: Uint8Array): Promise<PrintResult>
  status(): Promise<PrinterStatus>
  /** Bring a stored pairing back after the app was backgrounded. OPTIONAL and backend-specific: BLE
   *  re-opens its GATT link (a BLE session does not survive backgrounding); the wired backend has no
   *  session — one socket per ticket — so it is a no-op there. Added 17 September 2026 so usePrinting
   *  no longer imports a BLE function directly: reconnect is a transport concern, behind the seam. */
  reconnect?(): Promise<void>
}

/** Phase-A stub: NO HARDWARE, AND IT SAYS SO. Discovers nothing, therefore connects to nothing, therefore
 *  refuses to send. `sink` still receives the bytes so the dev preview can show exactly what WOULD have
 *  been written — but receiving them is not printing them, and the returned result says that.
 *
 *  NOTE: `sendBytes` RETURNS `ok: false`, AND THAT IS THE WHOLE POINT OF THIS FILE TODAY. The watcher reads it
 *  as outcome 'failed' — CERTAIN nothing came out — so the order is left OUT of the printed set and the
 *  next tick re-selects it. Nothing is lost and nothing is falsely recorded as printed. Replaced wholesale
 *  by the MFi/BLE backend in Phase B; nothing above the seam changes. */
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

// ── ONE TRANSPORT PER APP, AND WHY IT IS A MODULE SINGLETON ────────────────────────────────────────
// A printer is ONE serial device. Two transport instances would mean two connection states for one piece
// of hardware, and the settings card and the print watcher would each believe a different one. They must
// read the same object, and neither owns it, so it lives here.
// NOTE: The sink is a no-op in the app. The dev preview builds its OWN stub with a real sink; it does not use
// this accessor, which is why the bytes are dropped here rather than buffered — a buffer nobody reads is
// a memory leak wearing a feature's clothes.
let _transport: PrinterTransport | null = null
/** Which kind the live singleton was built for, so a kind change can retire it. */
let _transportKind: PrinterKind | null = null
/** The stored kind, once loaded. null = not loaded yet OR absent — both read as 'ble' (today). */
let _kind: PrinterKind | null = null

/** The effective kind: 'net' only when the device has explicitly chosen it AND the running binary
 *  actually carries the plugin. A stored 'net' on an older binary therefore reads as 'ble' — today's
 *  transport, today's `active`, no guard, no /api/printing — which is the whole of FIX 1. */
export function getPrinterKind(): PrinterKind { return _kind === 'net' && isNetPrinterAvailable() ? 'net' : 'ble' }

/** Load the stored kind. Called once by usePrinting before the first transport use, and by the card.
 *  Any failure reads as 'ble'. If the singleton was built for a different kind it is retired so the
 *  next getPrinterTransport() builds the right one. */
export async function loadPrinterKind(): Promise<PrinterKind> {
  try { _kind = (await Preferences.get({ key: PRINTER_KIND_KEY })).value === 'net' ? 'net' : 'ble' }
  catch { _kind = 'ble' }
  if (_transport && _transportKind !== getPrinterKind()) { _transport = null; _transportKind = null }
  return getPrinterKind()
}

/** The card's write. 🔴 KIND CHANGE WITHOUT A RELOAD: the singleton is RETIRED, not disconnected — the
 *  BLE pairing stays stored and its session is simply no longer the one usePrinting reads. The next
 *  getPrinterTransport() constructs the chosen backend, which reads its own stored state (the BLE
 *  pairing, or the wired address) lazily. Switching back therefore finds the old pairing intact. */
export async function setPrinterKind(kind: PrinterKind): Promise<void> {
  await Preferences.set({ key: PRINTER_KIND_KEY, value: kind })
  _kind = kind
  // The EFFECTIVE kind, not the stored one: on a binary without the plugin 'net' still resolves to 'ble'.
  if (_transportKind !== getPrinterKind()) { _transport = null; _transportKind = null }
}

/** The app's single transport, chosen by the device's stored kind.
 *  NATIVE + 'ble' (or absent) -> the Bluetooth LE backend (lib/printing/bleTransport.ts) — TODAY'S path.
 *  NATIVE + 'net'             -> the wired backend (lib/printing/netTransport.ts).
 *  WEB                        -> the honest stub, whatever the kind: a browser has no printer.
 *  The native modules are required lazily so a web bundle never pulls a native plugin in. */
export function getPrinterTransport(): PrinterTransport {
  const kind = getPrinterKind()
  if (_transport && _transportKind === kind) return _transport
  if (Capacitor.isNativePlatform()) {
    if (kind === 'net') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createNetTransport } = require('./netTransport') as typeof import('./netTransport')
      _transport = createNetTransport()
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createBleTransport } = require('./bleTransport') as typeof import('./bleTransport')
      _transport = createBleTransport()
    }
  } else {
    _transport = createStubTransport(() => { /* no sink in the app; see the note above */ })
  }
  _transportKind = kind
  return _transport
}
