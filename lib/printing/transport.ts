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

export type PrinterClass = 'mfi' | 'ble'

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

/** The app's single transport.
 *  NATIVE -> the real Bluetooth LE backend (lib/printing/bleTransport.ts).
 *  WEB    -> the honest stub, which refuses everything and says why. A browser has no printer, and a
 *            stub that refuses is the truthful answer rather than an error.
 *  The BLE module is required lazily so a web bundle never pulls the native plugin in. */
export function getPrinterTransport(): PrinterTransport {
  if (_transport) return _transport
  if (Capacitor.isNativePlatform()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createBleTransport } = require('./bleTransport') as typeof import('./bleTransport')
    _transport = createBleTransport()
  } else {
    _transport = createStubTransport(() => { /* no sink in the app; see the note above */ })
  }
  return _transport
}
