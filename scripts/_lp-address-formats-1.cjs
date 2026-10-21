// scripts/_lp-address-formats-1.cjs — THE NAMED CHANGES OF address-formats-1 (21 October 2026, docs/address-formats-1-report.md),
// shared by the harnesses that capture API bodies (language-phase-1d, -1d2, …). A MODULE. Each is a PRECISE transform of
// a BEFORE capture into what the code now answers; anything else that moved still fails.
//
//   1  countrySettingsAddressKey — a country-settings object's `addressFormat` is the FORMAT KEY the loader now reads the
//      legacy column value as: 'postcode' → 'gb', 'zip_state' → 'us' (lib/country-settings.ts, lib/address-formats.ts).
//   2  eventsWithAddressFormat(fmt) — /api/events' events each gain `addressFormat` (the truck's format key), right after
//      `region` when the event has one, else after `postcode` (app/api/events/route.ts).

const LEGACY = { postcode: 'gb', zip_state: 'us' }

function onJson(v, f) {
  if (typeof v === 'string' && (v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) {
    try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(f(p)) } catch { /* not JSON */ }
  }
  return null
}

function countrySettingsAddressKey(v) {
  if (typeof v === 'string') return onJson(v, countrySettingsAddressKey) ?? v
  if (Array.isArray(v)) return v.map(countrySettingsAddressKey)
  if (!v || typeof v !== 'object') return v
  const isCs = 'countryCode' in v && 'allergenSet' in v && typeof v.addressFormat === 'string'
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, isCs && k === 'addressFormat' && x in LEGACY ? LEGACY[x] : countrySettingsAddressKey(x)]))
}

const withFormat = (ev, fmt) => {
  if (!ev || typeof ev !== 'object' || 'addressFormat' in ev || !('postcode' in ev)) return ev
  const after = 'region' in ev ? 'region' : 'postcode'
  const out = {}
  for (const [k, x] of Object.entries(ev)) { out[k] = x; if (k === after) out.addressFormat = fmt }
  return out
}

/** A captured /api/events answer ({ status, body: "<json>" } or the parsed body) with every event object carrying `fmt` —
 *  the `events` list and any single event the answer also holds (an event object: venue_name + postcode + is_private). */
const isEvent = o => o && typeof o === 'object' && !Array.isArray(o) && 'venue_name' in o && 'postcode' in o && 'is_private' in o
const eventsWithAddressFormat = fmt => function f(v) {
  if (typeof v === 'string') return onJson(v, f) ?? v
  if (Array.isArray(v)) return v.map(f)
  if (!v || typeof v !== 'object') return v
  const inner = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, f(x)]))
  return isEvent(inner) ? withFormat(inner, fmt) : inner
}

module.exports = { countrySettingsAddressKey, eventsWithAddressFormat }
