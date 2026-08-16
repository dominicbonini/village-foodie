'use client'
// ── BLUETOOTH LE TRANSPORT — the real backend behind PrinterTransport ─────────────────────────────────
// Implements the seam in ./transport.ts against @capacitor-community/bluetooth-le (pinned 8.3.0).
// Everything above the seam is unchanged: renderTicket still emits the ESC/POS Uint8Array, usePrinting
// still hands it to sendBytes, and the watcher still decides WHEN. This file only moves bytes.
//
// ── BLE ONLY. NOT MFi. ───────────────────────────────────────────────────────────────────────────────
// MFi (ExternalAccessory) needs enrolment in Apple's MFi Program with the manufacturer's protocol string
// registered against this app, and a printer the manufacturer has certified. Neither exists. BLE needs a
// usage-description string and nothing else, and standard ESC/POS thermal printers expose a
// serial-over-GATT write characteristic, which is all this file uses.
//
// ── DISCOVERY, NOT A HARD-CODED MODEL ────────────────────────────────────────────────────────────────
// There is no standard "ESC/POS over BLE" UUID. Vendors use their own: 18f0/2af1 (many Chinese modules),
// ff00/ff02, e7810a71-… (Star), and others. Hard-coding one would support one family of printers and
// silently fail on the rest, and the failure would look like "the printer is broken".
// So: enumerate the peripheral's services and pick the first WRITABLE characteristic outside the two
// generic GATT services. Preference order is writeWithoutResponse THEN write, because a receipt is a
// one-way stream and write-without-response is materially faster over a slow link.
//
// ── THE FAILURE DIRECTION IS THE WHOLE DESIGN, AND IT USES THE THREE OUTCOMES ALREADY BUILT ──────────
// usePrinting maps `{ ok: false }` to outcome 'failed' (CERTAIN nothing came out — reprint carries no
// banner) and a THROW to 'unknown' (paper MAY exist — the next ticket carries POSSIBLE DUPLICATE).
// This file uses that distinction deliberately:
//   • not connected, or the FIRST chunk fails   -> return ok:false. Nothing left the phone.
//   • a chunk fails AFTER at least one succeeded -> THROW. Part of a ticket may be on paper, and only a
//     duplicate-marked reprint is honest about that. A half-printed ticket is worse than none, and the
//     only thing worse is a half-printed ticket the kitchen believes is whole.
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import type { PrinterTransport, PrinterAvailability, PrinterStatus, PrintResult, DiscoveredPrinter } from './transport'

/** Per-DEVICE, in Capacitor Preferences — the same store the four printing settings and the outbox use,
 *  and per-device for the same reason keep-awake is: the printer is paired to THIS iPad over Bluetooth.
 *  🔴 NOT a column. A truck with two devices has two pairings, and a shared value would make one device's
 *  printer the other's. */
const K = { id: 'hg_printer_id', name: 'hg_printer_name', svc: 'hg_printer_svc', chr: 'hg_printer_chr' } as const

/** Generic Access (1800) and Generic Attribute (1801) are on every peripheral and carry no printer data. */
const GENERIC_SERVICES = ['00001800-0000-1000-8000-00805f9b34fb', '00001801-0000-1000-8000-00805f9b34fb']

// ── RANKING, NOT FILTERING ───────────────────────────────────────────────────────────────────────────
// DEVICE-OBSERVED 15 August: the list offered "Dominic's Apple Watch" and "Dominic's AirPods Pro" with a
// Connect button beside each, and connecting to one SUCCEEDED. A reviewer who sees a printer list offering
// AirPods concludes the feature is broken.
// 🔴 AN ALLOW-LIST IS STILL REJECTED, FOR THE REASON THIS FILE ALREADY GAVE: vendors use their own UUIDs,
// so an unlisted printer would become INVISIBLE and the operator could do nothing about it. A cluttered
// list is untidy; an invisible printer is unfixable. So these signals ORDER the list, they never remove
// a row from it.
//
// SERVICE UUIDs seen on ESC/POS BLE printers. INFERRED from the field, NOT read from our code or from any
// vendor document in the repo — treat as suggestive, never conclusive.
//   18f0 — very common on the cheap Chinese modules (with 2af1 as the write characteristic)
//   ff00 / ffe0 — generic serial-over-BLE profiles used by many
//   49535343-… — the Microchip/ISSC "transparent UART" service a large number of printers ship
//   e7810a71-… — Star
const PRINTER_SERVICE_HINTS = ['18f0', 'ff00', 'ffe0', '49535343', 'e7810a71']

// NAME heuristics. INFERRED, and weaker than the UUID signal: a printer is not obliged to say so in its
// name, and nothing stops another device using one of these words.
const PRINTER_NAME_HINTS = /print|pos\b|receipt|thermal|star\s|epson|bixolon|munbyn|rongta|sprt|zj-?\d|xp-?\d|mtp-?\d|gp-?\d|rp\d/i

// Names that are almost certainly NOT a printer. Used ONLY to push a row DOWN the list — never to drop it.
const NOT_PRINTER_NAME_HINTS = /airpod|watch|iphone|ipad|macbook|imac|\bmac\b|beats|buds|headphone|earbud|tv\b|homepod|fitbit|garmin|tile\b|speaker|band\b/i

/** Suggestive only. Two signals, both INFERRED, and the row is listed either way. */
function looksLikePrinter(name: string, uuids: string[] | undefined): boolean {
  const advertised = (uuids || []).join(' ').toLowerCase()
  if (PRINTER_SERVICE_HINTS.some(h => advertised.includes(h))) return true
  if (NOT_PRINTER_NAME_HINTS.test(name)) return false
  return PRINTER_NAME_HINTS.test(name)
}

/** ESC @ — the ESC/POS "initialise printer" command, and the probe in check 3. */
const ESC_POS_RESET = [0x1B, 0x40]

/** ── CHUNK SIZE ──────────────────────────────────────────────────────────────────────────────────────
 *  180 bytes. The floor for BLE is a 23-byte MTU (20 bytes of payload) and modern stacks negotiate 185+;
 *  the plugin requests a larger MTU on Android and iOS negotiates on its own. 180 sits under a 185 MTU
 *  and is a safe multiple of nothing in particular — it is chosen to be large enough that a 2 KB ticket
 *  is ~12 writes rather than 100, and small enough that a conservative peripheral still accepts it.
 *  ⚠️ IF A PRINTER TRUNCATES LINES, THIS IS THE FIRST NUMBER TO LOWER — try 20 before suspecting the
 *  encoder. Recorded here because that symptom looks like a rendering bug and is not one. */
const CHUNK = 180

/** Gap between writes. A thermal printer consumes its buffer at paper speed, not at radio speed, and a
 *  burst with no pacing is the classic cause of dropped bytes mid-receipt. 12 ms is ~150 ms of overhead
 *  on a 12-chunk ticket, which no operator can perceive. */
const CHUNK_GAP_MS = 12

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Loaded lazily so a browser (or a build without the plugin) never touches the native bridge. */
async function ble() {
  const mod = await import('@capacitor-community/bluetooth-le')
  return mod.BleClient
}

interface Session { deviceId: string; name: string; service: string; characteristic: string; withoutResponse: boolean }

export function createBleTransport(): PrinterTransport {
  let session: Session | null = null
  let initialised = false

  /** initialize() prompts for permission on first call. Idempotent; safe to call before every operation. */
  // ── 🔴 androidNeverForLocation: true — WHY AN OPTION APPEARS ON A CALL THAT HAD NONE ───────────────
  // ANDROID ONLY; iOS ignores it entirely. Without it the flag defaults FALSE, and the plugin's own
  // initialize() (BluetoothLe.kt, the SDK_INT >= S branch) then requests ACCESS_FINE_LOCATION ALONGSIDE
  // BLUETOOTH_SCAN and BLUETOOTH_CONNECT. So an operator connecting a RECEIPT PRINTER was asked to share
  // their location, which is alarming, reasonable to refuse, and indistinguishable from "printing is
  // broken" once refused.
  // 🔴 THE ASSERTION IS TRUE OF THIS APP, WHICH IS THE ONLY GROUND FOR MAKING IT. It declares that BLE
  // scan results are never used to derive physical location. lib/printing reads exactly two fields off a
  // scan result — deviceId and name (see scan() below) — and nothing anywhere derives position from RSSI,
  // beacons or anything else. If that ever stops being true this flag must come off in the same change.
  // ⚠️ IT NARROWS WHAT ANDROID RETURNS, AND THAT IS THE TRADE. Android honours the assertion by filtering
  // out results whose only purpose could be location inference — chiefly BEACONS. A thermal printer
  // advertises a name and a GATT service, so it is not in that class. See the report's B3.
  const ensureInit = async (): Promise<void> => {
    if (initialised) return
    const BleClient = await ble()
    await BleClient.initialize({ androidNeverForLocation: true })
    initialised = true
  }

  /** Find the first writable characteristic that is not on a generic GATT service. */
  const findWriteTarget = async (deviceId: string): Promise<{ service: string; characteristic: string; withoutResponse: boolean } | null> => {
    const BleClient = await ble()
    const { services } = { services: await BleClient.getServices(deviceId) } as unknown as { services: Array<{ uuid: string; characteristics: Array<{ uuid: string; properties: { write: boolean; writeWithoutResponse: boolean } }> }> }
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

  const clearStored = async () => {
    await Promise.all([
      Preferences.remove({ key: K.id }), Preferences.remove({ key: K.name }),
      Preferences.remove({ key: K.svc }), Preferences.remove({ key: K.chr }),
    ])
  }

  const transport: PrinterTransport = {
    // ── AVAILABILITY ─────────────────────────────────────────────────────────────────────────────────
    // Four answers, not a boolean, so the card can give the operator the RIGHT instruction. A throw from
    // initialize() is how this plugin reports a refused permission, and "radio off" is a separate query.
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

    // ── SCAN ─────────────────────────────────────────────────────────────────────────────────────────
    // A bounded, self-terminating scan. `requestLEScan` + a fixed window is used rather than
    // `requestDevice` because requestDevice presents the OS picker, which gives the operator a second,
    // differently-styled list — and gives an App Review reviewer a system sheet with nothing in it.
    // Our own list can explain an empty result; the OS sheet cannot.
    async scan(): Promise<DiscoveredPrinter[]> {
      if (!Capacitor.isNativePlatform()) return []
      await ensureInit()
      const BleClient = await ble()
      const found = new Map<string, DiscoveredPrinter>()
      await BleClient.requestLEScan({ allowDuplicates: false }, result => {
        const id = result?.device?.deviceId
        if (!id) return
        // NAMELESS PERIPHERALS ARE DROPPED. A receipt printer advertises a name; a nameless row is an
        // unidentifiable MAC address an operator cannot choose between, and the list would fill with
        // every phone and earbud in the venue.
        const name = result?.device?.name || result?.localName
        if (!name) return
        // 🔴 EVERY NAMED DEVICE IS STILL LISTED. `likely` only decides WHICH SECTION it lands in.
        found.set(id, { id, name, class: 'ble', likely: looksLikePrinter(name, result?.uuids) })
      })
      await sleep(6000)
      try { await BleClient.stopLEScan() } catch { /* already stopped */ }
      return [...found.values()]
    },

    // ── CONNECT — THREE CHECKS, AND NOTHING IS CLAIMED UNTIL ALL THREE PASS ─────────────────────────
    // 1. the GATT link opens at all
    // 2. a WRITABLE characteristic exists outside the generic services — without one the device cannot
    //    receive a ticket under any circumstances, so this rules it out definitively
    // 3. an ESC/POS `ESC @` (initialise) write is ACCEPTED
    //
    // 🔴 WHAT CHECK 3 DOES AND DOES NOT PROVE. `ESC @` is ONE-WAY: ESC/POS sends no reply, and BLE
    // resolves a write when the peripheral's stack accepts the bytes, not when a printer acts on them.
    // So a PASS means only "this device accepted a write on its writable characteristic" — it does NOT
    // prove a printer is there, that it understood, or that paper moved. THE PROBE RULES THINGS OUT;
    // IT CANNOT RULE THEM IN. Every string this returns is worded to claim no more than that.
    //
    // 🔴 `session` IS SET ONLY AFTER ALL THREE PASS, AND THE PREFERENCES WRITE COMES AFTER IT. status()
    // reads `session`, so a device that failed a check can never be reported as connected, and a failed
    // device is never persisted for the resume-reconnect to pick up. That property was fixed once in the
    // stub and must not regress here.
    async connect(printerId: string): Promise<PrintResult> {
      if (!Capacitor.isNativePlatform()) return { ok: false, error: 'Printing is only available in the app' }
      const BleClient = await ble()
      /** Leave nothing half-open. Idempotent and never throws. */
      const abandon = async () => {
        session = null
        try { await BleClient.disconnect(printerId) } catch { /* already gone */ }
      }
      try {
        await ensureInit()
        // CHECK 1 — the link. onDisconnect nulls the session, which is what keeps status() truthful
        // without polling the radio.
        await BleClient.connect(printerId, () => { session = null })

        // CHECK 2 — a writable characteristic.
        const target = await findWriteTarget(printerId)
        if (!target) {
          await abandon()
          return { ok: false, error: 'That device does not look like a printer — it has no channel a ticket could be sent on' }
        }

        // CHECK 3 — the ESC @ probe. See the note above for exactly how little a pass proves.
        try {
          const { numbersToDataView } = await import('@capacitor-community/bluetooth-le')
          const view = numbersToDataView(ESC_POS_RESET)
          if (target.withoutResponse) await BleClient.writeWithoutResponse(printerId, target.service, target.characteristic, view)
          else await BleClient.write(printerId, target.service, target.characteristic, view)
        } catch {
          await abandon()
          return { ok: false, error: 'That device does not look like a printer — it refused a printer command' }
        }

        const devices = await BleClient.getConnectedDevices([]).catch(() => [] as Array<{ deviceId: string; name?: string }>)
        const name = devices.find(d => d.deviceId === printerId)?.name || 'Printer'
        // 🔴 ONLY NOW. Session first, then persistence — neither happens for a device that failed above.
        session = { deviceId: printerId, name, ...target }
        await Promise.all([
          Preferences.set({ key: K.id, value: printerId }),
          Preferences.set({ key: K.name, value: name }),
          Preferences.set({ key: K.svc, value: target.service }),
          Preferences.set({ key: K.chr, value: target.characteristic }),
        ])
        return { ok: true }
      } catch (e) {
        await abandon()
        return { ok: false, error: e instanceof Error ? e.message : 'Could not connect' }
      }
    },

    // ── DISCONNECT ───────────────────────────────────────────────────────────────────────────────────
    // Idempotent, and it CLEARS THE STORED PAIRING. Disconnecting is the operator saying "not this
    // printer"; leaving the id behind would have the next resume silently reconnect to it.
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

    // ── SEND ─────────────────────────────────────────────────────────────────────────────────────────
    // 🔴 THE CHUNK LOOP IS WHERE 'failed' AND 'unknown' ARE DECIDED. Read the header before changing it.
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
          // which is what puts POSSIBLE DUPLICATE on the next ticket. Returning ok:false here would
          // claim certainty we do not have, in the direction that hides a half-printed sheet.
          throw new Error(`partial write after ${sent} of ${bytes.length} bytes: ${msg}`)
        }
        if (i + CHUNK < bytes.length) await sleep(CHUNK_GAP_MS)
      }
      return { ok: true }
    },

    // ── STATUS ───────────────────────────────────────────────────────────────────────────────────────
    // 🔴 TRUTHFUL AT ALL TIMES. It reports the LIVE session object, which onDisconnect nulls the moment
    // the radio drops. It never infers a connection from a stored id — that is precisely the lie the
    // stub used to tell.
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
  }

  return transport
}

/** ── RECONNECT ON RESUME ────────────────────────────────────────────────────────────────────────────
 *  Called by the printing bridge on app resume. A BLE link does not survive backgrounding, so without
 *  this an operator who switches apps comes back to a printer that looks paired and is not.
 *  ⚠️ SILENT AND BEST-EFFORT BY DESIGN: it re-uses the STORED service/characteristic rather than
 *  re-discovering, so it is one round trip; if it fails, status() keeps saying "not connected" and the
 *  card keeps saying so. It never prompts and never surfaces an error — a failed background reconnect is
 *  not an event an operator did anything to cause. */
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
