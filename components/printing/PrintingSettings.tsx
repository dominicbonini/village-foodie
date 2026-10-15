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
import type { TimeSettings } from '@/lib/time-utils'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Preferences } from '@capacitor/preferences'
import { getPrinterTransport, loadPrinterKind, setPrinterKind, type PrinterKind, type PrinterAvailability, type DiscoveredPrinter } from '@/lib/printing/transport'
import { fetchNetPrinting, claimNetPrinting, setNetPrinterAddress, bumpNetGuard, decideNetPrinting, readCachedClaim, type NetPrintingRead, type NetGuardState } from '@/lib/printing/networkGuard'
import { NET_ADDRESS_KEY } from '@/lib/printing/netTransport'
import { parseNetAddress } from '@/lib/printing/netAddress'
import { printerMessageText, type PrinterMessage } from '@/lib/printing/printerText'
import { useT, useAppLocale } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/printing'
import { renderTestTicket } from '@/lib/printing/testTicket'
import { PrinterTypeChoice } from '@/components/printing/PrinterTypeChoice'
import { getDeviceId } from '@/lib/native/device'
import { isNativeApp } from '@/lib/native/device'
import { canAccess, type Plan } from '@/lib/features'
import { Toggle } from '@/components/dashboard/OrderCard'
import type { PaperWidth } from '@/lib/printing/ticket'
import type { PrintTriggerMode } from '@/lib/printing/printWatcher'

// The FOUR genuinely device-local settings. 🔴 There is deliberately no `mode` key — the trigger mode is
// trucks.print_trigger_mode and arrives as a prop. Adding one back would recreate the drift this removed.
const K = { printer: 'hg_printer_name', lead: 'hg_print_lead_mins', paper: 'hg_paper_width', enabled: 'hg_print_enabled' } as const

export function PrintingSettings({ plan, featureOverrides, trialExpiresAt, mode, onChangeMode, connected = false, statusDetail, waitingCount = 0, time }: {
  /** 🔴 The truck's time settings (Phase 2B) — the test ticket's stamp is the truck's clock. */
  time?: TimeSettings | null
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
  /** Operator-facing reason shown when `connected` is false. Never a stack trace. A CODE from the transport (or a
   *  native string), turned into words here at render — lib/printing/printerText.ts. */
  statusDetail?: PrinterMessage
  /** 🔴 Tickets due that have not printed. The number that turns "no printer" into a consequence. */
  waitingCount?: number
}) {
  // 🔴 THE CARD'S WORDS (messages/en-GB.json `printing`, Language Phase 1b). A message from the printer stack is
  // held in state as a CODE (PrinterMessage) and turned into words HERE, at render — `say` — never in a handler
  // or an effect, and no translator joins a dependency array.
  const t = useT('printing.card')
  const locale = useAppLocale()
  const say = (m: PrinterMessage) => printerMessageText(locale, m)
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
  const [pairingError, setPairingError] = useState<PrinterMessage | null>(null)
  const [availability, setAvailability] = useState<PrinterAvailability | null>(null)
  const [localConnected, setLocalConnected] = useState<boolean | null>(null)
  const [localName, setLocalName] = useState<string | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [showOther, setShowOther] = useState(false)      // "Other devices" starts collapsed, never hidden
  const liveConnected = localConnected ?? connected

  // ── PRINTER TYPE (17 September 2026): 'ble' (today, and the value an absent setting reads as) or 'net'.
  // The dashboard token comes from the route — this card renders only under /dashboard/[token] and takes
  // no token prop, and the dashboard page is not edited by the wired build.
  const params = useParams<{ token?: string }>()
  const token = typeof params?.token === 'string' ? params.token : ''
  const [kind, setKind] = useState<PrinterKind>('ble')
  const [netAddress, setNetAddress] = useState('')            // the input
  const [netInfo, setNetInfo] = useState<NetPrintingRead | undefined>(undefined)   // undefined = not fetched; 'pin' = PIN truck
  const [netGuard, setNetGuard] = useState<NetGuardState | null>(null)
  const [netBusy, setNetBusy] = useState<'connect' | 'test' | 'move' | null>(null)
  const [netMsg, setNetMsg] = useState<PrinterMessage | null>(null)   // the last connect/test result, operator-facing
  const [netOk, setNetOk] = useState<boolean | null>(null)     // this device's last probe/send result
  const [netAvailability, setNetAvailability] = useState<PrinterAvailability | null>(null)

  const refreshNet = async () => {
    const deviceId = getDeviceId()
    const info = await fetchNetPrinting(token, deviceId)
    setNetInfo(info)
    const vanId = info && info !== 'pin' ? info.vanId : null
    const cached = vanId ? await readCachedClaim(vanId) : null
    setNetGuard(decideNetPrinting({ deviceId, info, cachedHolder: cached }).state)
    // A PIN truck stops here: no address is pre-filled and no claim is ever attempted.
    if (info === 'pin') return
    // Pre-fill from the VAN's stored address (shared), else this device's last address.
    if (info?.address) setNetAddress(a => a || info.address || '')
    else { try { const mine = (await Preferences.get({ key: NET_ADDRESS_KEY })).value; if (mine) setNetAddress(a => a || mine) } catch { /* leave empty */ } }
    try { setNetAvailability(await getPrinterTransport().availability()) } catch { /* unknown */ }
  }

  useEffect(() => {
    if (!isNativeApp()) return
    let off = false
    void (async () => {
      const en = (await Preferences.get({ key: K.enabled })).value
      const p = (await Preferences.get({ key: K.printer })).value
      const l = parseInt((await Preferences.get({ key: K.lead })).value ?? '10', 10)
      const w = parseInt((await Preferences.get({ key: K.paper })).value ?? '80', 10)
      if (off) return
      const k = await loadPrinterKind()
      if (off) return
      setEnabled(en === 'true'); setPrinter(p); setLead(Number.isFinite(l) ? l : 10); setPaper(w === 58 ? 58 : 80)
      setKind(k)
      setReady(true)
      if (k === 'net') void refreshNet()
    })()
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setPairingError(e instanceof Error ? e.message : { code: 'scanFailed' })
    } finally { setScanning(false) }
  }
  const connectTo = async (d: DiscoveredPrinter) => {
    setPairingError(null); setConnectingId(d.id)
    try {
      const res = await getPrinterTransport().connect(d.id)
      if (res.ok) { setLocalConnected(true); setLocalName(d.name); setPrinter(d.name); setFound(null) }
      else setPairingError(res.error ?? { code: 'couldNotConnectPrinter' })
    } catch (e) {
      setPairingError(e instanceof Error ? e.message : { code: 'couldNotConnectPrinter' })
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
          <p className="text-sm font-semibold text-slate-800">{`🖨 ${t('title')}`}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 🔴 "● Connected" ONLY when a real pairing exists. In Phase A nothing writes K.printer, so this
              never shows — which is the honest answer, not a missing feature. Phase B writes a real name
              and this lights up with no code change. */}
          {enabled && printer && <span className="text-[11px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{`● ${t('badgeConnected')}`}</span>}
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
          {/* ── PRINTER TYPE — ask "Bluetooth or wired?" FIRST, inside the enabled block only (17 Sep 2026).
              A device with printing OFF still sees only the title, description and toggle. Absent ⇒
              Bluetooth is selected and the stored Bluetooth pairing is untouched — switching the type
              retires the transport singleton, it never disconnects or clears a pairing. Dominic asked for
              a connect step that asks wired-or-wireless; this is that question, placed where the
              connect controls begin, so it reads as the first step of connecting rather than a setting
              hidden elsewhere. */}
          <PrinterTypeChoice kind={kind} onChoose={async k => { if (k === kind) return; await setPrinterKind(k); setKind(k); setNetMsg(null); setNetOk(null); if (k === 'net') void refreshNet() }} />
          {kind !== 'net' ? (
            <>
          {liveConnected ? (
            <div className="flex items-center justify-between gap-3 text-xs border border-green-200 bg-green-50 rounded-lg px-3 py-2">
              <span className="text-green-800 min-w-0 truncate">
                {(() => { const name = localName ?? printer; return t.rich('connectedTo', { hasName: name != null ? 'yes' : 'no', name: name ?? '', b: c => <strong>{c}</strong> }) })()}
              </span>
              <button onClick={disconnectPrinter} className="shrink-0 font-semibold text-red-600 hover:text-red-700">{t('disconnect')}</button>
            </div>
          ) : (
            <div className="text-xs text-slate-500 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 flex flex-col gap-2">
              <div>
                {t.rich('noPrinter', { withDetail: statusDetail ? 'yes' : 'no', detail: statusDetail ? say(statusDetail) : '', b: c => <strong className="text-amber-800">{c}</strong> })}
                {waitingCount > 0 && (
                  <span className="block mt-1 font-semibold text-amber-800">
                    {t('waitingBle', { n: waitingCount, count: String(waitingCount) })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={runScan} disabled={scanning}
                  className="shrink-0 font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                  {scanning ? t('scanning') : t('scan')}
                </button>
                {scanning && <span className="text-slate-500">{t('scanningHint')}</span>}
              </div>
              {/* 🔴 THE AVAILABILITY BRANCHES. Each names the ONE thing the operator can do about it. */}
              {availability === 'off' && (
                <p className="text-amber-800">{t('bluetoothOff')}</p>
              )}
              {availability === 'unauthorised' && (
                <p className="text-amber-800">{t('bluetoothUnauthorised')}</p>
              )}
              {availability === 'unsupported' && (
                <p className="text-amber-800">{t('bluetoothUnsupported')}</p>
              )}
              {pairingError && <p className="text-red-600">{say(pairingError)}</p>}
              {/* 🔴 THE EMPTY RESULT, WHICH IS THE ONE A REVIEWER WILL SEE. */}
              {found?.length === 0 && !scanning && (
                <p className="text-amber-800">{t('noneFound')}</p>
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
                    <span className="shrink-0 text-orange-600 font-semibold">{connectingId === d.id ? t('connecting') : t('connect')}</span>
                  </button>
                )
                return (
                  <div className="flex flex-col gap-1">
                    {/* 🔴 NO EMPTY BOX. When nothing ranks as likely the heading is replaced by a line
                        that reads as "not recognised yet, here is everything", and the other list is
                        shown OPEN — a collapsed empty-looking panel would read as a failure. */}
                    {likely.length > 0 ? (
                      <>
                        <p className="text-slate-600">{t('likelyHeading')}</p>
                        {likely.map(row)}
                      </>
                    ) : (
                      <p className="text-slate-600">{t('noneRecognised')}</p>
                    )}
                    {other.length > 0 && (
                      likely.length === 0 ? (
                        <>{other.map(row)}</>
                      ) : (
                        <>
                          <button onClick={() => setShowOther(v => !v)} aria-expanded={showOther}
                            className="text-left text-slate-500 hover:text-slate-700 font-semibold py-1">
                            {showOther ? t('hideOther') : t('showOther', { count: String(other.length) })}
                          </button>
                          {showOther && (
                            <>
                              <p className="text-slate-500">{t('otherHint')}</p>
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
            </>
          ) : (
            /* ── WIRED PRINTER — an address on the kitchen router, one socket per ticket ──────────────
               Every line here is wired-only copy. The Bluetooth sentences live in the branch above and
               nowhere else. The guard states come from the SAME decideNetPrinting usePrinting gates on. */
            <div className="text-xs text-slate-600 border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 flex flex-col gap-2">
              {/* 🔴 A PIN TRUCK SHOWS THIS SENTENCE AND NOTHING ELSE. /api/printing answered 401 with
                  requiresPin, so no address field, no Connect, no test ticket and NO CLAIM — every one of
                  them would 401 too. See NetPrintingRead in lib/printing/networkGuard.ts. */}
              {netInfo === 'pin' ? (
                <p className="text-amber-800">{say({ code: 'guard', state: 'pin' })}</p>
              ) : (
                <>
              {netInfo === null && (
                <p className="text-amber-800">{say({ code: 'guard', state: 'unknown' })}</p>
              )}
              {netInfo && !netInfo.columnsAvailable && (
                <p className="text-amber-800">{t('wiredUnavailable')}</p>
              )}
              {netInfo && netInfo.columnsAvailable && !netInfo.vanId && (
                <p className="text-amber-800">{say({ code: 'guard', state: 'unbound' })}</p>
              )}
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">{t('addressLabel')}</span>
                <input
                  type="text" inputMode="decimal" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  value={netAddress} placeholder="192.168.1.50"
                  onChange={e => { setNetAddress(e.target.value); setNetMsg(null) }}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </label>
              <p className="text-slate-500">{t('addressHint')}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <button disabled={!!netBusy || !parseNetAddress(netAddress)}
                  onClick={async () => {
                    setNetBusy('connect'); setNetMsg(null)
                    try {
                      const res = await getPrinterTransport().connect(netAddress)
                      setNetOk(res.ok)
                      if (res.ok) {
                        const norm = parseNetAddress(netAddress)?.normalised ?? netAddress
                        setNetMsg({ code: 'connectedTo', address: norm })
                        // Share the address with the van, so the next device is pre-filled with it.
                        const saved = await setNetPrinterAddress(token, getDeviceId(), netAddress)
                        if (!saved.ok) setNetMsg({ code: 'connectedToSaveFailed', address: norm, error: saved.error })
                        await refreshNet(); bumpNetGuard()
                      } else setNetMsg(res.error ?? { code: 'netCantReach', address: netAddress })
                    } catch (e) { setNetOk(false); setNetMsg(e instanceof Error ? e.message : { code: 'netCantReach', address: netAddress }) }
                    finally { setNetBusy(null); try { setNetAvailability(await getPrinterTransport().availability()) } catch { /* unknown */ } }
                  }}
                  className="shrink-0 font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                  {netBusy === 'connect' ? t('connecting') : t('connect')}
                </button>
                <button disabled={!!netBusy || netOk !== true}
                  onClick={async () => {
                    // 🔴 NOT an order: straight to the transport, never through the watcher, never into the
                    // dedupe record, never marking anything printed.
                    setNetBusy('test'); setNetMsg(null)
                    try {
                      const bytes = renderTestTicket({ truckName: netInfo?.truckName, paper, time })
                      const res = await getPrinterTransport().sendBytes(bytes)
                      setNetOk(res.ok)
                      setNetMsg(res.ok ? { code: 'testSent' } : (res.error ?? { code: 'testNotPrinted' }))
                    } catch (e) { setNetOk(false); setNetMsg({ code: 'testPartial', detail: (e instanceof Error ? e.message : '').trimEnd() }) }
                    finally { setNetBusy(null) }
                  }}
                  className="shrink-0 font-semibold text-orange-700 border border-orange-300 bg-white hover:bg-orange-50 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                  {netBusy === 'test' ? t('printing') : t('printTest')}
                </button>
                {netOk === true && netAddress && (
                  <button onClick={async () => { await getPrinterTransport().disconnect(); setNetOk(null); setNetMsg(null) }}
                    className="shrink-0 font-semibold text-red-600 hover:text-red-700">{t('disconnect')}</button>
                )}
              </div>
              {/* THE STATUS LINE — this device's last probe/send, never inferred from a stored address. */}
              {netAddress && netOk === true && <p className="text-green-800">{t.rich('connectedTo', { hasName: 'yes', name: parseNetAddress(netAddress)?.normalised ?? netAddress, b: c => <strong>{c}</strong> })}</p>}
              {netAddress && netOk === false && !netMsg && <p className="text-amber-800">{say({ code: 'netCantReach', address: parseNetAddress(netAddress)?.normalised ?? netAddress })}</p>}
              {netMsg && <p className={netOk ? 'text-green-800' : 'text-amber-800'}>{say(netMsg)}</p>}
              {netAvailability === 'unauthorised' && (
                <p className="text-amber-800">{say({ code: 'netPermission' })}</p>
              )}
              {netAvailability === 'unsupported' && (
                <p className="text-amber-800">{t('wiredAppOnly')}</p>
              )}
              {!parseNetAddress(netAddress) && netAddress.trim() !== '' && <p className="text-amber-800">{say({ code: 'addressHelp' })}</p>}
              {/* THE ONE-PRINTING-DEVICE GUARD — the same decision usePrinting gates `active` on. */}
              {netGuard === 'other' && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-amber-800">{say({ code: 'guard', state: 'other' })}</span>
                  <button disabled={!!netBusy}
                    onClick={async () => {
                      setNetBusy('move')
                      try { const r = await claimNetPrinting(token, getDeviceId()); if (!r.ok) setNetMsg(r.error ?? { code: 'couldNotMove' }); await refreshNet(); bumpNetGuard() }
                      finally { setNetBusy(null) }
                    }}
                    className="shrink-0 font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-3 py-1.5 rounded-lg">{say({ code: 'guardMove' })}</button>
                </div>
              )}
              {netGuard === 'unknown' && netInfo !== null && netInfo?.columnsAvailable !== false && (
                <p className="text-amber-800">{say({ code: 'guard', state: 'unknown' })}</p>
              )}
              {waitingCount > 0 && netGuard !== 'ok' && (
                <span className="block font-semibold text-amber-800">
                  {t('waitingNet', { n: waitingCount, count: String(waitingCount) })}
                </span>
              )}
                </>
              )}
            </div>
          )}
          {/* The WHOLE summary row is the disclosure control, with a chevron (▾ collapsed / ▲ expanded) —
              an obvious, positionally-stable expand affordance in both states (replaces the mid-card button). */}
          <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
            className="group flex items-center justify-between gap-3 w-full text-left">
            <span className="text-xs text-slate-600 min-w-0 truncate">
              {mode === 'on_confirmed'
                ? t.rich('summaryOnConfirmed', { paper: String(paper), b: c => <strong>{c}</strong> })
                : t.rich('summaryLead', { lead: String(lead), paper: String(paper), b: c => <strong>{c}</strong> })}
            </span>
            <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-slate-500 group-hover:text-orange-600 transition-colors">
              {t('settings')} <span aria-hidden>{expanded ? '▲' : '▾'}</span>
            </span>
          </button>

          {expanded && (
            // Full config — SAME controls as before (printer name + Change/Disconnect, minutes-before-due,
            // paper width), just gated behind the collapse. Nothing removed; presentation only.
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-3">
              {printer && <div className="flex items-center justify-between text-sm gap-3">
                <span className="text-slate-700 truncate">{t.rich('printerName', { name: printer, b: c => <strong>{c}</strong> })}</span>
                {/* "Change" (pick a DIFFERENT printer) is Phase B — the real BT scan/picker doesn't exist
                    yet, so there is nothing to change TO. This whole row only renders once a REAL pairing
                    exists (Phase B writes K.printer); Disconnect clears it and returns to the honest
                    "No printer connected" state above. */}
                <div className="flex gap-3 text-xs font-semibold shrink-0">
                  <button onClick={disconnect} className="text-red-600 hover:text-red-700">{t('disconnect')}</button>
                </div>
              </div>}
              {/* ── WHEN TO PRINT ─────────────────────────────────────────────────────────────────────
                  🔴 THE ON-ACCEPT CONSEQUENCE IS STATED IN THE OPTION ITSELF, NOT IN A TOOLTIP. An operator
                  choosing this must see, at the moment of choosing, that an advance pre-order prints hours
                  before its collection time — that is the whole difference between the two modes and it is
                  not discoverable from the label alone. */}
              <div className="flex flex-col gap-2">
                <span className="text-sm text-slate-700">{t('whenToPrint')}</span>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="print-mode" checked={mode === 'lead_time'}
                    onChange={() => setTriggerMode('lead_time')} className="mt-1 accent-orange-500" />
                  <span className="text-sm">
                    <span className="text-slate-800 font-medium">{t('modeLead')}</span>
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
                    <span className="text-slate-700 min-w-0">{t('leadLabel')}</span>
                    <input type="number" min={0} max={60} value={lead} onChange={e => setLeadMins(Number(e.target.value) || 0)}
                      className="w-20 shrink-0 -mt-1 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" />
                  </label>
                )}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="print-mode" checked={mode === 'on_confirmed'}
                    onChange={() => setTriggerMode('on_confirmed')} className="mt-1 accent-orange-500" />
                  <span className="text-sm">
                    <span className="text-slate-800 font-medium">{t('modeOnConfirmed')}</span>
                    <span className="block text-xs text-slate-500">{t('modeOnConfirmedHint')}</span>
                  </span>
                </label>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">{t('paperWidth')}</span>
                <div className="flex gap-1.5">
                  {([58, 80] as PaperWidth[]).map(w => (
                    <button key={w} onClick={() => setPaperWidth(w)}
                      className={`px-3 py-1 rounded-lg text-sm font-bold border ${paper === w ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>{t('paperOption', { width: String(w) })}</button>
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
