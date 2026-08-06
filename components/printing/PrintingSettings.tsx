'use client'
// Kitchen ticket printing — lives in the dashboard "Settings" tab. THREE gates:
//   1. iPad NATIVE only (renders null on web / in a browser) — printing is an app feature.
//   2. MAX plan ('ticket_printing' Feature via canAccess) — FUNCTIONALLY gated: the card renders null when
//      the plan isn't entitled (trial/test trucks include ticket_printing). The gate is SILENT — no MAX
//      badge and no "upgrade" copy in the UI.
//   3. PER-DEVICE — the printer is paired to THIS iPad (BT is device-bound), so the connect/settings state is
//      keyed on this device. A second device shows its OWN state (it can't drive the first's printer).
// An On/Off master toggle (hg_print_enabled) enables the feature per device; when off the card collapses to
// just the title + description + toggle. The four DEVICE settings live in Capacitor Preferences (printer
// name, paper width, lead minutes, enabled) — correctly, because the printer is paired to THIS iPad.
//
// ── 🔴 THE TRIGGER MODE IS NOT A DEVICE SETTING AND NO LONGER LIVES HERE ────────────────────────────
// It is a TRUCK column (trucks.print_trigger_mode, migration run 6 August 2026). It was briefly ALSO
// written to Preferences, which meant two homes for one value and nothing to arbitrate between them; that
// copy is gone. The card now takes `mode` and `onChangeMode` as props from the dashboard, exactly as every
// other truck-level setting in the Settings tab does. DO NOT REINTRODUCE A LOCAL COPY.
//
// ── 🔴 THE CARD MUST NOT CLAIM A CONNECTION IT DOES NOT HAVE ────────────────────────────────────────
// There is NO connection state anywhere: transport.ts's only status() hard-codes connected:true and its
// sendBytes cannot return ok:false. "Connect a printer" used to write the literal string
// 'Demo printer (Phase A stub)' into Preferences, after which the card showed a green "● Connected" badge.
// An operator on Max could switch printing on and be told they were connected to a printer that does not
// exist. The stub pairing is REMOVED. The connected rendering is kept — it is correct when a real pairing
// exists — so Phase B lights it up by writing a real name to the same key, with no second code path.
// ⚠️ The settings below are REAL and stay configurable: paper width and lead minutes are device values,
// and the trigger mode is a truck column. Only the CONNECTION claim changed.
import { useEffect, useState } from 'react'
import { Preferences } from '@capacitor/preferences'
import { isNativeApp } from '@/lib/native/device'
import { canAccess, type Plan } from '@/lib/features'
import { Toggle } from '@/components/dashboard/OrderCard'
import type { PaperWidth } from '@/lib/printing/ticket'
import type { PrintTriggerMode } from '@/lib/printing/printWatcher'

// The FOUR genuinely device-local settings. 🔴 There is deliberately no `mode` key — the trigger mode is
// trucks.print_trigger_mode and arrives as a prop. Adding one back would recreate the drift this removed.
const K = { printer: 'hg_printer_name', lead: 'hg_print_lead_mins', paper: 'hg_paper_width', enabled: 'hg_print_enabled' } as const

export function PrintingSettings({ plan, featureOverrides, trialExpiresAt, mode, onChangeMode }: {
  plan: Plan
  featureOverrides: Record<string, boolean> | null
  trialExpiresAt: string | null
  /** 🔴 trucks.print_trigger_mode, resolved by the caller. The single source of truth. */
  mode: PrintTriggerMode
  /** Persists to the truck column via /api/dashboard/action set_print_trigger_mode. */
  onChangeMode: (m: PrintTriggerMode) => Promise<void>
}) {
  const [ready, setReady] = useState(false)
  const [enabled, setEnabled] = useState(false)                 // On/Off master switch (this device)
  const [printer, setPrinter] = useState<string | null>(null)   // THIS device's paired printer (name)
  const [lead, setLead] = useState(10)
  const [paper, setPaper] = useState<PaperWidth>(80)
  const [expanded, setExpanded] = useState(false)               // when enabled+configured, config is COLLAPSED by default

  useEffect(() => {
    if (!isNativeApp()) return
    let off = false
    void (async () => {
      const en = (await Preferences.get({ key: K.enabled })).value
      const p = (await Preferences.get({ key: K.printer })).value
      const l = parseInt((await Preferences.get({ key: K.lead })).value ?? '10', 10)
      const w = parseInt((await Preferences.get({ key: K.paper })).value ?? '80', 10)
      if (off) return
      setEnabled(en === 'true'); setPrinter(p); setLead(Number.isFinite(l) ? l : 10); setPaper(w === 58 ? 58 : 80)
      setReady(true)
    })()
    return () => { off = true }
  }, [])

  if (!isNativeApp() || !ready) return null

  // MAX-plan gate — FUNCTIONAL: printing is a Max feature, so render nothing when the plan isn't entitled.
  // Silent (no badge / no upgrade copy).
  const canPrint = canAccess(plan, 'ticket_printing', featureOverrides ?? {}, trialExpiresAt)
  if (!canPrint) return null

  const setEnabledPref = async (v: boolean) => { setEnabled(v); if (!v) setExpanded(false); await Preferences.set({ key: K.enabled, value: String(v) }) }
  const setLeadMins = async (n: number) => { setLead(n); await Preferences.set({ key: K.lead, value: String(n) }) }
  const setPaperWidth = async (w: PaperWidth) => { setPaper(w); await Preferences.set({ key: K.paper, value: String(w) }) }
  // 🔴 Straight to the truck column — no local copy, no Preferences write.
  const setTriggerMode = async (m: PrintTriggerMode) => { await onChangeMode(m) }
  // 🔴 NO connect(). It used to write 'Demo printer (Phase A stub)' and manufacture a connected state.
  // Phase B writes a REAL paired name to K.printer and the connected rendering below lights up unchanged.
  const disconnect = async () => { await Preferences.remove({ key: K.printer }); setPrinter(null) }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">🖨 Kitchen ticket printing</p>
          <p className="text-xs text-slate-500 mt-0.5">Automatically print a kitchen ticket for each order when it&apos;s due.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 🔴 "● Connected" ONLY when a real pairing exists. In Phase A nothing writes K.printer, so this
              never shows — which is the honest answer, not a missing feature. Phase B writes a real name
              and this lights up with no code change. */}
          {enabled && printer && <span className="text-[11px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">● Connected</span>}
          {enabled && !printer && <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Coming soon</span>}
          <Toggle on={enabled} onToggle={() => setEnabledPref(!enabled)} />
        </div>
      </div>

      {enabled && (
        // 🔴 THE SETTINGS ARE REACHABLE WHETHER OR NOT A PRINTER IS PAIRED. They used to be gated behind
        // `printer`, which is why a FAKE pairing existed — the only way to reach real, configurable
        // settings was to manufacture a connection. Paper width and lead minutes are device values and the
        // trigger mode is a truck column; none of them needs a printer to be meaningful, and all of them
        // can be set up before the hardware arrives.
        <div className="flex flex-col gap-3">
          {/* ⚠️ THE HONEST CONNECTION STATE. No "Connect a printer" button, because there is nothing behind
              it: transport.ts has no pairing, no scan and no failure path. Saying so is the whole change. */}
          {!printer && (
            <p className="text-xs text-slate-500 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
              <strong className="text-amber-800">No printer connected.</strong> Bluetooth printer pairing
              isn&apos;t available yet — you can set your preferences here now and they&apos;ll apply as soon
              as it arrives.
            </p>
          )}
          {/* The WHOLE summary row is the disclosure control, with a chevron (▾ collapsed / ▲ expanded) —
              an obvious, positionally-stable expand affordance in both states (replaces the mid-card button). */}
          <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
            className="group flex items-center justify-between gap-3 w-full text-left">
            <span className="text-xs text-slate-600 min-w-0 truncate">
              {mode === 'on_confirmed'
                ? <>Print <strong>when accepted</strong> · {paper}mm paper</>
                : <>Print <strong>{lead} min</strong> before due · {paper}mm paper</>}
            </span>
            <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-slate-500 group-hover:text-orange-600 transition-colors">
              Settings <span aria-hidden>{expanded ? '▲' : '▾'}</span>
            </span>
          </button>

          {expanded && (
            // Full config — SAME controls as before (printer name + Change/Disconnect, minutes-before-due,
            // paper width), just gated behind the collapse. Nothing removed; presentation only.
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-3">
              {printer && <div className="flex items-center justify-between text-sm gap-3">
                <span className="text-slate-700 truncate">Printer: <strong>{printer}</strong></span>
                {/* "Change" (pick a DIFFERENT printer) is Phase B — the real BT scan/picker doesn't exist
                    yet, so there is nothing to change TO. This whole row only renders once a REAL pairing
                    exists (Phase B writes K.printer); Disconnect clears it and returns to the honest
                    "No printer connected" state above. */}
                <div className="flex gap-3 text-xs font-semibold shrink-0">
                  <button onClick={disconnect} className="text-red-600 hover:text-red-700">Disconnect</button>
                </div>
              </div>}
              {/* ── WHEN TO PRINT ─────────────────────────────────────────────────────────────────────
                  🔴 THE ON-ACCEPT CONSEQUENCE IS STATED IN THE OPTION ITSELF, NOT IN A TOOLTIP. An operator
                  choosing this must see, at the moment of choosing, that an advance pre-order prints hours
                  before its collection time — that is the whole difference between the two modes and it is
                  not discoverable from the label alone. */}
              <div className="flex flex-col gap-2">
                <span className="text-sm text-slate-700">When to print</span>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="print-mode" checked={mode === 'lead_time'}
                    onChange={() => setTriggerMode('lead_time')} className="mt-1 accent-orange-500" />
                  <span className="text-sm">
                    <span className="text-slate-800 font-medium">Shortly before collection</span>
                    <span className="block text-xs text-slate-500">The ticket prints a few minutes before the order is due.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="print-mode" checked={mode === 'on_confirmed'}
                    onChange={() => setTriggerMode('on_confirmed')} className="mt-1 accent-orange-500" />
                  <span className="text-sm">
                    <span className="text-slate-800 font-medium">As soon as you accept the order</span>
                    <span className="block text-xs text-slate-500">
                      An advance pre-order prints when you accept it, which may be hours before the collection
                      time. Orders you have not accepted yet never print.
                    </span>
                  </span>
                </label>
              </div>
              {mode === 'lead_time' && (
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-700">Print tickets this many minutes before due</span>
                  <input type="number" min={0} max={60} value={lead} onChange={e => setLeadMins(Number(e.target.value) || 0)}
                    className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" />
                </label>
              )}
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">Paper width</span>
                <div className="flex gap-1.5">
                  {([58, 80] as PaperWidth[]).map(w => (
                    <button key={w} onClick={() => setPaperWidth(w)}
                      className={`px-3 py-1 rounded-lg text-sm font-bold border ${paper === w ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>{w}mm</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
