'use client'
// Kitchen ticket printing — lives in the dashboard "Menu & Stock" tab. THREE gates:
//   1. iPad NATIVE only (renders null on web / in a browser) — printing is an app feature.
//   2. MAX plan ('ticket_printing' Feature) — hooked via canAccess() now; hard-enforce later.
//   3. PER-DEVICE — the printer is paired to THIS iPad (BT is device-bound), so the connect/settings state is
//      keyed on this device. A second device shows its OWN state (it can't drive the first's printer).
// PHASE A: settings live in Capacitor Preferences (device-local → testable now, no migration). They move to
// this device's van_devices row when its printing-columns migration is run (spec'd). The real BT pairing
// behind "Connect" is Phase B (hardware-gated) — stubbed here so BOTH UI states are viewable.
import { useEffect, useState } from 'react'
import { Preferences } from '@capacitor/preferences'
import { isNativeApp } from '@/lib/native/device'
import { canAccess, type Plan } from '@/lib/features'
import type { PaperWidth } from '@/lib/printing/ticket'

const K = { printer: 'hg_printer_name', lead: 'hg_print_lead_mins', paper: 'hg_paper_width' } as const

export function PrintingSettings({ plan, featureOverrides, trialExpiresAt }: {
  plan: Plan
  featureOverrides: Record<string, boolean> | null
  trialExpiresAt: string | null
}) {
  const [ready, setReady] = useState(false)
  const [printer, setPrinter] = useState<string | null>(null)   // THIS device's paired printer (name)
  const [lead, setLead] = useState(10)
  const [paper, setPaper] = useState<PaperWidth>(80)

  useEffect(() => {
    if (!isNativeApp()) return
    let off = false
    void (async () => {
      const p = (await Preferences.get({ key: K.printer })).value
      const l = parseInt((await Preferences.get({ key: K.lead })).value ?? '10', 10)
      const w = parseInt((await Preferences.get({ key: K.paper })).value ?? '80', 10)
      if (off) return
      setPrinter(p); setLead(Number.isFinite(l) ? l : 10); setPaper(w === 58 ? 58 : 80); setReady(true)
    })()
    return () => { off = true }
  }, [])

  if (!isNativeApp() || !ready) return null

  // MAX-plan gate — hooked now; to HARD-enforce later, return an upgrade card when !canPrint. Phase A renders
  // the section regardless (trial/test trucks include ticket_printing) with the MAX badge + a note.
  const canPrint = canAccess(plan, 'ticket_printing', featureOverrides ?? {}, trialExpiresAt)

  const setLeadMins = async (n: number) => { setLead(n); await Preferences.set({ key: K.lead, value: String(n) }) }
  const setPaperWidth = async (w: PaperWidth) => { setPaper(w); await Preferences.set({ key: K.paper, value: String(w) }) }
  // Phase A stub "pairing": sets a placeholder so the connected state is viewable. Phase B replaces this with
  // the real BT scan → select → store (printer_id/name/class on this device's van_devices row).
  const connect = async () => { const n = 'Demo printer (Phase A stub)'; await Preferences.set({ key: K.printer, value: n }); setPrinter(n) }
  const disconnect = async () => { await Preferences.remove({ key: K.printer }); setPrinter(null) }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800">🖨 Kitchen ticket printing</p>
          <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">MAX</span>
        </div>
        {printer && <span className="text-[11px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">● Connected</span>}
      </div>

      {!canPrint && (
        <p className="text-xs text-amber-700">Included on the <strong>Max</strong> plan — upgrade to print kitchen tickets.</p>
      )}

      {!printer ? (
        // NOT set up on THIS device → Connect entry point.
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-500">No printer connected on <strong>this device</strong>. Connect an iOS-compatible Bluetooth thermal printer — <strong>Star TSP143 / Epson TM-m30</strong> recommended for all-day use.</p>
          <button onClick={connect} className="self-start bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">Connect a printer</button>
          <p className="text-[11px] text-slate-400">Bluetooth pairing arrives with the printer hardware (coming soon). A cheap generic BLE printer works but isn&apos;t recommended for constant use and may lack status feedback.</p>
        </div>
      ) : (
        // SET UP on THIS device → status + ticket settings + manage.
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm gap-3">
            <span className="text-slate-700 truncate">Printer: <strong>{printer}</strong></span>
            <div className="flex gap-3 text-xs font-semibold shrink-0">
              <button onClick={connect} className="text-slate-600 hover:text-orange-600">Change</button>
              <button onClick={disconnect} className="text-red-600 hover:text-red-700">Disconnect</button>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-700">Print tickets this many minutes before due</span>
            <input type="number" min={0} max={60} value={lead} onChange={e => setLeadMins(Number(e.target.value) || 0)}
              className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" />
          </label>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-700">Paper width</span>
            <div className="flex gap-1.5">
              {([80, 58] as PaperWidth[]).map(w => (
                <button key={w} onClick={() => setPaperWidth(w)}
                  className={`px-3 py-1 rounded-lg text-sm font-bold border ${paper === w ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>{w}mm</button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Status is best-effort: an MFi printer reports paper-out/cover-open; a cheaper BLE printer may not — watch for missed tickets and use Reprint on the KDS.</p>
        </div>
      )}
    </div>
  )
}
