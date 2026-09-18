'use client'
// ── WIRED (NETWORK) TRANSPORT — the second real backend behind PrinterTransport ─────────────────────
// Implements the seam in ./transport.ts over the local plugin @hatchgrab/net-printer (raw TCP, port
// 9100 by default). Everything above the seam is unchanged: renderTicket still emits the ESC/POS bytes,
// usePrinting still hands them to sendBytes, and the watcher still decides WHEN. This file only moves
// bytes — one socket per ticket, opened, written, closed.
//
// ── THE FAILURE DIRECTION, USING THE THREE OUTCOMES ALREADY BUILT (§42) ─────────────────────────────
// usePrinting maps `{ ok: false }` to 'failed' (CERTAIN nothing came out — the reprint carries no
// banner) and a THROW to 'unknown' (paper MAY exist — the next ticket carries POSSIBLE DUPLICATE).
// The plugin reports `bytesWritten` EXACTLY, and that is what decides:
//   • refused / unreachable / timed out BEFORE any byte  → bytesWritten 0 → return ok:false
//   • any failure AFTER at least one byte left the device → bytesWritten > 0 → THROW
//   • the plugin call itself throws (bridge error)        → we cannot know    → THROW
// TCP is kinder than BLE here: a refused connection is unambiguous, so 'failed' is certain more often.
//
// ── TIMEOUTS ────────────────────────────────────────────────────────────────────────────────────────
// CONNECT 5 000 ms — DNS + the TCP handshake, and on iOS the FIRST-EVER attempt also covers the Local
// Network prompt (the connection waits while the sheet is up; refusing it fails the connection inside
// this window). WRITE 10 000 ms — from the first byte to the last; a 2 KB ticket normally takes tens of
// milliseconds, so a write timeout means the printer stopped reading mid-ticket.
//
// ── STATUS IS TRUTHFUL AT ALL TIMES ─────────────────────────────────────────────────────────────────
// `connected` is true only while an address is stored AND the last probe/send succeeded. It is never
// inferred from a stored address alone — that is exactly the lie the Phase-A stub used to tell.
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import type { NetPrinterErrorCode, NetPrinterPlugin } from '@hatchgrab/net-printer'
import { isNetPrinterAvailable } from './transport'
import type { PrinterTransport, PrinterAvailability, PrinterStatus, PrintResult, DiscoveredPrinter } from './transport'
import { parseNetAddress, NET_ADDRESS_HELP } from './netAddress'

/** Per-DEVICE, like the BLE pairing keys — the address this device last connected to. The VAN's
 *  address lives in truck_vans.network_printer_address and is what the card pre-fills from. */
export const NET_ADDRESS_KEY = 'hg_net_printer_address'

export const NET_CONNECT_TIMEOUT_MS = 5000
export const NET_WRITE_TIMEOUT_MS = 10000

/** Loaded lazily so a browser never touches the native bridge. */
async function plugin(): Promise<NetPrinterPlugin> {
  const mod = await import('@hatchgrab/net-printer')
  return mod.NetPrinter
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
  return btoa(s)
}

/** Operator-facing wording for a plugin error code. Never a stack trace. */
export function describeNetError(code: NetPrinterErrorCode | undefined, address: string): string {
  switch (code) {
    case 'permission': return 'HatchGrab needs permission to reach your printer. Turn on Local Network for HatchGrab in Settings.'
    case 'refused': return `Can't reach the printer at ${address} — it isn't accepting connections.`
    case 'timeout': return `Can't reach the printer at ${address} — it didn't answer in time.`
    case 'unreachable': return `Can't reach the printer at ${address} — check it's on the same network.`
    case 'invalid': return NET_ADDRESS_HELP
    case 'unsupported': return 'Printing is only available in the app'
    default: return `Can't reach the printer at ${address}`
  }
}

export function createNetTransport(): PrinterTransport {
  let address: string | null = null       // the stored, normalised "host:port"
  let loaded = false
  let lastOk = false
  let lastCode: NetPrinterErrorCode | undefined

  const load = async () => {
    if (loaded) return
    loaded = true
    try { address = (await Preferences.get({ key: NET_ADDRESS_KEY })).value } catch { address = null }
  }

  const transport: PrinterTransport = {
    // ── AVAILABILITY ─────────────────────────────────────────────────────────────────────────────────
    // iOS has no API to ASK about Local Network permission; a refusal is only observable as a failed
    // connection carrying errorCode 'permission' (see the Swift source). So 'unauthorised' is reported
    // after such a failure, and 'available' otherwise — which on a device that has never connected is
    // the honest answer, because the first connect is what shows the prompt.
    async availability(): Promise<PrinterAvailability> {
      // 🔴 NO PLUGIN IN THIS BINARY ⇒ 'unsupported', the same answer a browser gets. A remote-URL shell
      // running an older build reaches this file only by accident (the card never offers Wired there);
      // it must still refuse rather than claim a backend it cannot call. See isNetPrinterAvailable.
      if (!isNetPrinterAvailable()) return 'unsupported'
      return lastCode === 'permission' ? 'unauthorised' : 'available'
    },

    // No discovery in this build (no NSBonjourServices): the operator types the address.
    async scan(): Promise<DiscoveredPrinter[]> { return [] },

    // ── CONNECT = PARSE → PROBE (ESC @) → STORE, in that order, and the store happens LAST ──────────
    async connect(raw: string): Promise<PrintResult> {
      if (!Capacitor.isNativePlatform()) return { ok: false, error: 'Printing is only available in the app' }
      const parsed = parseNetAddress(raw)
      if (!parsed) return { ok: false, error: NET_ADDRESS_HELP }
      try {
        const res = await (await plugin()).probe({ host: parsed.host, port: parsed.port, connectTimeoutMs: NET_CONNECT_TIMEOUT_MS, writeTimeoutMs: NET_WRITE_TIMEOUT_MS })
        if (!res.ok) {
          lastOk = false; lastCode = res.errorCode
          return { ok: false, error: describeNetError(res.errorCode, parsed.normalised) }
        }
      } catch (e) {
        lastOk = false; lastCode = 'io'
        return { ok: false, error: e instanceof Error ? e.message : 'Could not reach the printer' }
      }
      // 🔴 ONLY NOW. The address is persisted after the probe succeeded, never before.
      address = parsed.normalised; loaded = true; lastOk = true; lastCode = undefined
      try { await Preferences.set({ key: NET_ADDRESS_KEY, value: parsed.normalised }) } catch { /* status still truthful in memory */ }
      return { ok: true }
    },

    async disconnect(): Promise<void> {
      address = null; loaded = true; lastOk = false; lastCode = undefined
      try { await Preferences.remove({ key: NET_ADDRESS_KEY }) } catch { /* nothing to release */ }
    },

    // ── SEND — WHERE 'failed' AND 'unknown' ARE DECIDED. Read the header before changing it. ────────
    async sendBytes(bytes: Uint8Array): Promise<PrintResult> {
      await load()
      if (!Capacitor.isNativePlatform()) return { ok: false, error: 'Printing is only available in the app' }
      if (!address) return { ok: false, error: 'No printer connected' }
      const parsed = parseNetAddress(address)
      if (!parsed) return { ok: false, error: NET_ADDRESS_HELP }
      let res
      try {
        res = await (await plugin()).send({ host: parsed.host, port: parsed.port, base64: toBase64(bytes), connectTimeoutMs: NET_CONNECT_TIMEOUT_MS, writeTimeoutMs: NET_WRITE_TIMEOUT_MS })
      } catch (e) {
        // The bridge itself failed: nothing tells us whether bytes left. Pessimistic ⇒ 'unknown'.
        lastOk = false; lastCode = 'io'
        throw new Error(`printer call failed: ${e instanceof Error ? e.message : String(e)}`)
      }
      if (res.ok) { lastOk = true; lastCode = undefined; return { ok: true } }
      lastOk = false; lastCode = res.errorCode
      const msg = describeNetError(res.errorCode, parsed.normalised)
      // 🔴 NOTHING LEFT THE DEVICE — certain failure. The reprint is a FIRST ticket, unmarked.
      if (!res.bytesWritten || res.bytesWritten <= 0) return { ok: false, error: msg }
      // 🔴 PART OF THE TICKET MAY BE ON PAPER. Throwing is what makes usePrinting record 'unknown'.
      throw new Error(`partial write after ${res.bytesWritten} of ${bytes.length} bytes: ${msg}`)
    },

    // ── STATUS — connected ONLY while an address is stored AND the last probe/send succeeded ─────────
    async status(): Promise<PrinterStatus> {
      if (!Capacitor.isNativePlatform()) return { connected: false, detail: 'Printing is only available in the app' }
      await load()
      if (address && lastOk) return { connected: true, printerName: address }
      return {
        connected: false,
        printerName: address ?? undefined,
        detail: address ? describeNetError(lastCode, address) : 'No printer connected',
      }
    },

    // One socket per ticket: there is no session to bring back after a background. Deliberate no-op.
    async reconnect(): Promise<void> { /* nothing to reconnect */ },
  }
  return transport
}
