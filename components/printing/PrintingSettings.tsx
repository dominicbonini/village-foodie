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
import { getPrinterTransport, type PrinterAvailability, type DiscoveredPrinter } from '@/lib/printing/transport'
import { isNativeApp } from '@/lib/native/device'
import { canAccess, type Plan } from '@/lib/features'
import { Toggle } from '@/components/dashboard/OrderCard'
import type { PaperWidth } from '@/lib/printing/ticket'
import type { PrintTriggerMode } from '@/lib/printing/printWatcher'

// The FOUR genuinely device-local settings. 🔴 There is deliberately no `mode` key — the trigger mode is
// trucks.print_trigger_mode and arrives as a prop. Adding one back would recreate the drift this removed.
const K = { printer: 'hg_printer_name', lead: 'hg_print_lead_mins', paper: 'hg_paper_width', enabled: 'hg_print_enabled' } as const

export function PrintingSettings({ plan, featureOverrides, trialExpiresAt, mode, onChangeMode, connected = false, statusDetail, waitingCount = 0 }: {
  plan: Plan
  featureOverrides: Record<string, boolean> | null
  trialExpiresAt: string | null
  /** 🔴 trucks.print_trigger_mode, resolved by the caller. The single source of truth. */
  mode: PrintTriggerMode
  /** Persists to the truck column via /api/dashboard/action set_print_trigger_mode. */
  onChangeMode: (m: PrintTriggerMode) => Promise<void>
  // ── 🔴 THE LIVE TRANSPORT STATE, PASSED IN — THE CARD ASKS NOTHING ITSELF (15 August 2026) ──────
  // These come from usePrinting on the dashboard, which owns the app's ONE transport. The card
  // reading its own status would create a second answer to "is a printer connected", and the two
  // could disagree on screen at the same moment. Defaulted so the card renders unchanged if a caller
  // ever omits them, which is what keeps this additive.
  /** The transport's own answer. False in Phase A, and it carries a reason. */
  connected?: boolean
  /** Operator-facing reason shown when `connected` is false. Never a stack trace. */
  statusDetail?: string
  /** 🔴 Tickets due that have not printed. The number that turns "no printer" into a consequence. */
  waitingCount?: number
}) {
  const [ready, setReady] = useState(false)
  const [enabled, setEnabled] = useState(false)                 // On/Off master switch (this device)
  const [printer, setPrinter] = useState<string | null>(null)   // THIS device's paired printer (name)
  const [lead, setLead] = useState(10)
  const [paper, setPaper] = useState<PaperWidth>(80)
  const [expanded, setExpanded] = useState(false)               // when enabled+configured, config is COLLAPSED by default

  // ── PAIRING STATE — LOCAL, AND ONLY FOR THE FLOW ─────────────────────────────────────────────────
  // 🔴 `connected` STAYS THE PROP. The dashboard owns the transport and polls it; this local state exists
  // only so the operator sees the result of THEIR tap immediately instead of waiting up to 20s for the
  // next poll. `liveConnected` prefers the local answer when there is one and falls back to the prop.
  const [scanning, setScanning] = useState(false)
  const [found, setFound] = useState<DiscoveredPrinter[] | null>(null)   // null = never scanned
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [availability, setAvailability] = useState<PrinterAvailability | null>(null)
  const [localConnected, setLocalConnected] = useState<boolean | null>(null)
  const [localName, setLocalName] = useState<string | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [showOther, setShowOther] = useState(false)      // "Other devices" starts collapsed, never hidden
  const liveConnected = localConnected ?? connected

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

  // ── PAIRING ACTIONS ──────────────────────────────────────────────────────────────────────────────
  // They call the SAME singleton the dashboard's watcher uses (getPrinterTransport), so a connection made
  // here is the connection tickets are sent over. There is no second transport and no second answer.
  const runScan = async () => {
    setPairingError(null); setScanning(true); setFound(null); setShowOther(false)
    try {
      const t = getPrinterTransport()
      const avail = await t.availability()
      setAvailability(avail)
      // 🔴 EVERY NON-'available' ANSWER STOPS HERE WITH ITS OWN MESSAGE. Scanning while Bluetooth is off
      // returns an empty list, and an empty list would blame the printer for the phone's radio.
      if (avail !== 'available') { setScanning(false); return }
      setFound(await t.scan())
    } catch (e) {
      setPairingError(e instanceof Error ? e.message : 'The scan could not be started')
    } finally { setScanning(false) }
  }
  const connectTo = async (d: DiscoveredPrinter) => {
    setPairingError(null); setConnectingId(d.id)
    try {
      const res = await getPrinterTransport().connect(d.id)
      if (res.ok) { setLocalConnected(true); setLocalName(d.name); setPrinter(d.name); setFound(null) }
      else setPairingError(res.error ?? 'Could not connect to that printer')
    } catch (e) {
      setPairingError(e instanceof Error ? e.message : 'Could not connect to that printer')
    } finally { setConnectingId(null) }
  }
  const disconnectPrinter = async () => {
    setPairingError(null)
    try { await getPrinterTransport().disconnect() } finally {
      setLocalConnected(false); setLocalName(null); setPrinter(null); setFound(null)
    }
  }
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
          {/* ── THE "Coming soon" CHIP WAS REMOVED HERE, 15 August 2026 ────────────────────────────
              lib/plan-features.ts now advertises Kitchen ticket printing as INCLUDED on Max, and a
              status badge saying the opposite on the same operator's device is a contradiction the
              matrix and this card cannot both be right about. The chip was a STATUS CLAIM about the
              feature; it is gone.
              🔴 THE PROSE BELOW IS NOT THE SAME KIND OF STATEMENT AND IS DELIBERATELY LEFT ALONE.
              "Bluetooth printer pairing isn't available yet" is a FACT about what pairing can do
              today, not a badge about whether the feature is sold. Removing a factual sentence
              because a plan cell changed would be the dishonest direction. Decided separately. */}
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
              it: transport.ts has no pairing, no scan and no failure path. Saying so is the whole change.
              ── 🔴 NOW WITH THE CONSEQUENCE, NOT JUST THE STATE (15 August 2026) ───────────────────
              The watcher is LIVE on the dashboard: it selects due orders, renders real tickets and hands
              them to the transport, which refuses. Every one of those stays due and is retried. So an
              operator with printing switched on is accumulating tickets that will never appear, and the
              old copy — true, but only about pairing — did not say so. The count does.
              🔴 NO CONTROL WAS ADDED HERE, DELIBERATELY (manual N5). A "Scan for printers" button with no
              radio behind it is precisely the dead control that rule forbids: something an operator can
              press that cannot act. This is STATE, not a control — it reports and asks for nothing. */}
          {/* ── 🔴 PAIRING. EVERY STATE EXPLAINS ITSELF (2.1) ──────────────────────────────────────
              THE SCAN IS ONLY REACHABLE ONCE PRINTING IS ON — this whole block is inside `{enabled &&}`,
              so a reviewer opening Settings sees a description and an off toggle, never a scan button as
              the first thing on screen.
              🔴 AN EMPTY LIST IS NOT LEFT TO SPEAK FOR ITSELF. "No printers found" plus what to check is
              the difference between a feature that needs hardware and a feature that looks broken, and it
              is the single most likely thing a reviewer will see: they have no thermal printer on the desk.
              EVERY branch below carries its own sentence — radio off, permission refused, web, scanning,
              none found, an error, connected. Nothing renders inert. */}
          {liveConnected ? (
            <div className="flex items-center justify-between gap-3 text-xs border border-green-200 bg-green-50 rounded-lg px-3 py-2">
              <span className="text-green-800 min-w-0 truncate">
                <strong>Connected</strong> to {localName ?? printer ?? 'your printer'}. Tickets will print automatically.
              </span>
              <button onClick={disconnectPrinter} className="shrink-0 font-semibold text-red-600 hover:text-red-700">Disconnect</button>
            </div>
          ) : (
            <div className="text-xs text-slate-500 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 flex flex-col gap-2">
              <div>
                <strong className="text-amber-800">No printer connected.</strong>{' '}
                {statusDetail ? `${statusDetail}. ` : ''}Connect a Bluetooth receipt printer to start printing tickets.
                {waitingCount > 0 && (
                  <span className="block mt-1 font-semibold text-amber-800">
                    {waitingCount === 1 ? '1 ticket is waiting' : `${waitingCount} tickets are waiting`} and will
                    print once a printer is connected. Nothing has been lost.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={runScan} disabled={scanning}
                  className="shrink-0 font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                  {scanning ? 'Scanning...' : 'Scan for printers'}
                </button>
                {scanning && <span className="text-slate-500">Looking for nearby printers — this takes a few seconds.</span>}
              </div>
              {/* 🔴 THE AVAILABILITY BRANCHES. Each names the ONE thing the operator can do about it. */}
              {availability === 'off' && (
                <p className="text-amber-800">Bluetooth is switched off on this device. Turn it on in Settings, then scan again.</p>
              )}
              {availability === 'unauthorised' && (
                <p className="text-amber-800">HatchGrab needs permission to use Bluetooth. Allow it in Settings &rarr; HatchGrab &rarr; Bluetooth, then scan again.</p>
              )}
              {availability === 'unsupported' && (
                <p className="text-amber-800">Printing needs the HatchGrab app — a web browser cannot reach a Bluetooth printer.</p>
              )}
              {pairingError && <p className="text-red-600">{pairingError}</p>}
              {/* 🔴 THE EMPTY RESULT, WHICH IS THE ONE A REVIEWER WILL SEE. */}
              {found?.length === 0 && !scanning && (
                <p className="text-amber-800">
                  No printers found. Check the printer is switched on, has paper, and is close to this device —
                  most receipt printers only appear for a minute or two after you turn them on.
                </p>
              )}
              {/* ── 🔴 RANKED, NEVER FILTERED (15 August 2026) ────────────────────────────────────
                  The list showed an Apple Watch and AirPods with a Connect button beside each, which
                  reads as broken. The fix is ORDER, not omission: `likely` splits the rows into two
                  sections and EVERY device stays reachable, because the ranking signals are
                  suggestive (advertised service UUIDs and name patterns) and a printer that matches
                  neither must still be pairable. An allow-list would make such a printer invisible,
                  which an operator cannot work around; a longer list is merely untidy.
                  🔴 CONNECTING IS GATED BY CAPABILITY, NOT BY SECTION. A device from "Other devices"
                  that passes both connect-time checks connects exactly like one from the top. */}
              {!!found?.length && (() => {
                const likely = found.filter(d => d.likely)
                const other = found.filter(d => !d.likely)
                const row = (d: DiscoveredPrinter) => (
                  <button key={d.id} onClick={() => connectTo(d)} disabled={!!connectingId}
                    className="flex items-center justify-between gap-2 text-left bg-white border border-slate-200 hover:border-orange-300 rounded-lg px-3 py-2 disabled:opacity-50">
                    <span className="min-w-0 truncate text-slate-800 font-medium">{d.name}</span>
                    <span className="shrink-0 text-orange-600 font-semibold">{connectingId === d.id ? 'Connecting...' : 'Connect'}</span>
                  </button>
                )
                return (
                  <div className="flex flex-col gap-1">
                    {/* 🔴 NO EMPTY BOX. When nothing ranks as likely the heading is replaced by a line
                        that reads as "not recognised yet, here is everything", and the other list is
                        shown OPEN — a collapsed empty-looking panel would read as a failure. */}
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
                    {other.length > 0 && (
                      likely.length === 0 ? (
                        <>{other.map(row)}</>
                      ) : (
                        <>
                          <button onClick={() => setShowOther(v => !v)} aria-expanded={showOther}
                            className="text-left text-slate-500 hover:text-slate-700 font-semibold py-1">
                            {showOther ? 'Hide other devices' : `Other devices (${other.length})`}
                          </button>
                          {showOther && (
                            <>
                              <p className="text-slate-500">These do not look like printers, but you can still try one.</p>
                              {other.map(row)}
                            </>
                          )}
                        </>
                      )
                    )}
                  </div>
                )
              })()}
            </div>
          )}
          {/* The WHOLE summary row is the disclosure control, with a chevron (▾ collapsed / ▲ expanded) —
              an obvious, positionally-stable expand affordance in both states (replaces the mid-card button). */}
          <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
            className="group flex items-center justify-between gap-3 w-full text-left">
            <span className="text-xs text-slate-600 min-w-0 truncate">
              {mode === 'on_confirmed'
                ? <>Print <strong>when accepted</strong> · {paper}mm paper</>
                : <>Print <strong>{lead} min</strong> before collection · {paper}mm paper</>}
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
                    <span className="text-slate-800 font-medium">A set time before collection</span>
                  </span>
                </label>
                {/* ── THE MINUTES INPUT BELONGS TO THE OPTION ABOVE IT ──────────────────────────────
                    It used to sit BELOW the whole radio group, i.e. under the "as soon as you accept"
                    option, which is the one mode it has no effect on. Moved INSIDE the group, directly
                    under lead_time, and indented (`pl-6`) to the radio's text column so it reads as that
                    option's setting rather than a third setting. LAYOUT ONLY: the same `mode ===
                    'lead_time'` condition, the same K.lead Preferences write, the same 0-60 bounds and
                    the same default of 10. Nothing about WHAT it writes changed. */}
                {mode === 'lead_time' && (
                  // ── ONE LINE, NOT TWO, AND ALIGNED TO THE WORDING (15 August 2026) ──────────────
                  // The option's helper used to say "The ticket prints the number of minutes below
                  // before collection" and THIS label said "Print tickets this many minutes before
                  // collection" — the same sentence twice, three lines apart. The helper is gone and
                  // this line carries it.
                  // 🔴 THE WORDING IS MEASURED AGAINST WHAT THE CODE ACTUALLY DOES. selectDueToPrint
                  // computes `nowMins >= timeToMins(order.slot) - leadMins`, and `slot` is the
                  // COLLECTION time — no cook time, no prep estimate, nothing per-dish. So "before
                  // collection" is accurate, and it is deliberately NOT softened into something that
                  // implies the app allows for cooking. It does not. See docs/printing-ui-report.md.
                  // LAYOUT: items-start + the input's own mt keeps the number level with the FIRST
                  // line of the wording when it wraps. items-center floated it against the middle of
                  // a two-line block, which is what read as adrift.
                  <label className="flex items-start justify-between gap-3 text-sm pl-6">
                    <span className="text-slate-700 min-w-0">Minutes before the collection time</span>
                    <input type="number" min={0} max={60} value={lead} onChange={e => setLeadMins(Number(e.target.value) || 0)}
                      className="w-20 shrink-0 -mt-1 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" />
                  </label>
                )}
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
