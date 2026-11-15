// lib/printing/netAvailability.ts — app-fixes-1 (14 November 2026): "is the wired backend in this binary?", on its own.
// 🔴 WHY THIS IS ITS OWN MODULE. It lived in transport.ts, and netTransport.ts imported it from there while transport.ts
// `require()`d netTransport.ts — a cycle. Turbopack's production build merged that cycle (transport, netTransport,
// netAddress, printerText and the `printing` catalog) into ONE module factory and emitted only transport.ts's body: in
// the app, printerMessageText was undefined (Paramètres crashed: "printerMessageText is not a function") and the
// `printing` words were never registered (the card showed raw keys, MISSING_MESSAGE: printing.card). Dev builds were
// fine. This module imports nothing from lib/printing, so nothing here can close a cycle again
// (scripts/app-fixes-1.cjs checks the printing modules for cycles and require()).
import { Capacitor } from '@capacitor/core'

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
