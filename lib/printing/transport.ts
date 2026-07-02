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
// Phase A (now, no hardware): use createStubTransport() → routes the same bytes to a sink (preview/log), so
// the whole shared pipeline is testable. Swap in the real backend in Phase B without touching anything above.

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
