// lib/till/device-fingerprint.ts — 🔴 till-pack-2 (25 November 2026, docs/till-pack-2-report.md; the law check, docs/till-law-1-report.md
// §3 change 8): THE DEVICE'S OWN FINGERPRINT OF AN OFFLINE WALK-UP.
//
// PURE AND CLIENT-SAFE (the digest is passed in: Web Crypto on the device, node:crypto in the harness). When the native outbox QUEUES a
// walk-up (lib/native/orderGate.ts, the one place every queued create passes through), the device computes
//     fingerprint = sha256( canonical JSON of { order_key, order: <the queued manualOrder>, created_at } )
// and sends it, its stable device id and that creation time with the replay as `till_device`. The server stores them in
// till_device_fingerprints BEFORE the order row (supabase/migrations/20261133_till_pack_2.sql), so the order's first sealed version
// carries them and till_till_id names the device instead of 'manual'.
// ⚠️ The fingerprint is the DEVICE's evidence of what it held and when — stored as sent, never recomputed by the server (the server
// re-prices and normalises the order, so its own content would not hash the same).
// ⚠️ An older app sends no `till_device`; the server then does exactly what it did before. A device with no Web Crypto (an insecure dev
// context) sends none either — never a weaker hash.

/** JSON with every object's keys sorted (bytewise), no spaces; arrays keep their order. Numbers and strings as JSON.stringify writes them. */
export function canonicalJson(v: unknown): string {
  if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map(x => (x === undefined ? 'null' : canonicalJson(x))).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter(k => o[k] !== undefined).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
}

/** The exact text the device hashes. */
export function fingerprintInput(orderKey: string, manualOrder: unknown, createdAtIso: string): string {
  return canonicalJson({ order_key: orderKey, order: manualOrder ?? null, created_at: createdAtIso })
}

export interface TillDevice { device_id: string; fingerprint: string; created_at: string }

const DEVICE_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/
const HEX64 = /^[0-9a-f]{64}$/

/** A `till_device` value from an untrusted request body, checked — or null (absent or malformed: then nothing is stored). */
export function parseTillDevice(raw: unknown): TillDevice | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.device_id !== 'string' || !DEVICE_ID_RE.test(r.device_id)) return null
  if (typeof r.fingerprint !== 'string' || !HEX64.test(r.fingerprint)) return null
  if (typeof r.created_at !== 'string' || !Number.isFinite(Date.parse(r.created_at))) return null
  return { device_id: r.device_id, fingerprint: r.fingerprint, created_at: new Date(Date.parse(r.created_at)).toISOString() }
}

/** The device side: the `till_device` value for a queued walk-up, or null when the device cannot hash (no Web Crypto) or has no id. */
export async function tillDeviceFor(
  orderKey: string,
  manualOrder: unknown,
  deviceId: string,
  digestHex: (text: string) => Promise<string | null>,
  now: Date = new Date(),
): Promise<TillDevice | null> {
  if (!deviceId || !DEVICE_ID_RE.test(deviceId)) return null
  const created_at = now.toISOString()
  const fingerprint = await digestHex(fingerprintInput(orderKey, manualOrder, created_at))
  if (!fingerprint || !HEX64.test(fingerprint)) return null
  return { device_id: deviceId, fingerprint, created_at }
}

/** sha256 hex with Web Crypto, or null when it is not available (an insecure context). */
export async function webSha256Hex(text: string): Promise<string | null> {
  try {
    const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
    if (!subtle) return null
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}
