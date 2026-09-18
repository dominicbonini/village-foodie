// lib/printing/netAddress.ts — the ONE parser for a wired printer's address, shared by the card, the
// transport and the /api/printing route so the three cannot disagree about what counts as valid.
// No Capacitor import here on purpose: the server route imports it.

export const DEFAULT_NET_PRINTER_PORT = 9100

export interface NetAddress { host: string; port: number; /** "host:port", the stored form */ normalised: string }

/** "192.168.1.50" or "192.168.1.50:9100" (or a hostname) → { host, port }. Null when invalid. IPv4 and
 *  plain hostnames only — a kitchen router hands out IPv4, and bracketed IPv6 is out of scope. */
export function parseNetAddress(raw: string | null | undefined): NetAddress | null {
  const s = (raw ?? '').trim()
  if (!s || s.length > 253) return null
  const m = /^([A-Za-z0-9][A-Za-z0-9.\-]*)(?::(\d{1,5}))?$/.exec(s)
  if (!m) return null
  const host = m[1]
  if (host.endsWith('.') || host.includes('..')) return null
  const port = m[2] ? parseInt(m[2], 10) : DEFAULT_NET_PRINTER_PORT
  if (!(port >= 1 && port <= 65535)) return null
  return { host, port, normalised: `${host}:${port}` }
}

/** The operator-facing reason when parseNetAddress returns null. */
export const NET_ADDRESS_HELP = "Enter the printer's address as 192.168.1.50 or 192.168.1.50:9100."
