'use client'
// ── THE PRINTER TYPE CHOICE — AND THE GATE THAT DECIDES WHETHER "WIRED" EXISTS AT ALL ──────────────
//
// 🔴 RENDERS NOTHING WHEN THE RUNNING BINARY HAS NO NetPrinter PLUGIN. That is this file's whole job.
//
// The native app is a REMOTE-URL shell: capacitor.config's `server.url` is https://www.hatchgrab.com/app,
// so the webview loads the LIVE site and a Vercel deploy is an instant change to every SHIPPED app
// (reference manual §36 / V11.3). The moment the wired build deploys, every device still running the
// store binary executes this code — and those binaries contain no NetPrinterPlugin. If the choice were
// offered there, an operator could pick "Wired", the kind would store as 'net', getPrinterTransport()
// would build the wired backend, and every plugin call would reject with "NetPrinter does not have an
// implementation" — which netTransport.sendBytes turns into a THROW, i.e. outcome 'unknown', i.e. a
// POSSIBLE DUPLICATE banner about a printer the device could never have reached. Worse, `active` would
// then depend on a guard that can never resolve, so Bluetooth printing would stop on a working truck.
//
// With this gate, such a device sees EXACTLY the Bluetooth card it saw before — no new control, no new
// sentence — and getPrinterKind() reads any stored 'net' as 'ble', so the transport, the `active`
// expression and /api/printing are all untouched too.
//
// ⚠️ IT IS ITS OWN FILE SO IT CAN BE PROVEN. scripts/printing-gating.cjs renders this component with the
// plugin mocked absent and asserts the markup is empty, then renders it present and asserts the control
// appears. A gate buried as one `&&` inside four hundred lines of card JSX cannot be tested that way,
// and an untestable gate protecting live trucks is not a gate. DO NOT INLINE IT BACK INTO THE CARD.
import { isNetPrinterAvailable, type PrinterKind } from '@/lib/printing/transport'

export function PrinterTypeChoice({ kind, onChoose }: {
  kind: PrinterKind
  /** Writes the device's kind and re-points the transport. Never called when this renders null. */
  onChoose: (k: PrinterKind) => void | Promise<void>
}) {
  if (!isNetPrinterAvailable()) return null
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-700">Printer type</span>
      <div className="flex gap-1.5">
        {([['ble', 'Bluetooth'], ['net', 'Wired']] as [PrinterKind, string][]).map(([k, label]) => (
          <button key={k} onClick={() => { void onChoose(k) }}
            className={`px-3 py-1 rounded-lg text-sm font-bold border ${kind === k ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>{label}</button>
        ))}
      </div>
    </div>
  )
}
