// scripts/_named-admin-speed-1.cjs — admin-speed-1 (16 November 2026, docs/admin-speed-1-report.md): ITS EDIT TO
// lib/country-settings.ts, NAMED, so the byte-identity proofs that pin that file (costs-accounts-1, …) can put it back.
//
// The edit: getCountrySettingsMany read each code with its own query (Promise.all of getCountrySettings); it now reads every
// code the cache misses in ONE query, with an optional best-effort list. undoCode() swaps the new function (doc comment to
// closing brace, found by exact markers) for the old six lines. Null when the markers are not there exactly once — so any other
// change to the file still fails the proof that uses it.
const BEFORE = `/** Several countries at once, keyed by code. Each one is as loud as getCountrySettings. */
export async function getCountrySettingsMany(codes: Iterable<string>): Promise<Record<string, CountrySettings>> {
  const unique = [...new Set([...codes].map(c => String(c).trim().toUpperCase()))]
  const rows = await Promise.all(unique.map(c => getCountrySettings(c)))
  return Object.fromEntries(rows.map(r => [r.countryCode, r]))
}`
const START = `/**
 * Several countries at once, keyed by code, in ONE query for whatever the 60-second cache does not already hold
 * (admin-speed-1,`
const END = `  for (const k of [...fatal, ...extra]) { const v = found.get(k); if (v) out[v.countryCode] = v }
  return out
}`
// The admin page: its load() and the mount effect (one round of requests instead of check_admin → load → demo_cleanup). Put back
// from the page as it was at BASE (the commit this work started from), between the same two markers.
const PAGE = 'app/(app)/admin/page.tsx'
const BASE = '1661ebe5'
const PAGE_START = '  // ── admin-speed-1 (16 November 2026): ONE ROUND OF REQUESTS, NOT A CHAIN.'
const PAGE_END_BEFORE = '  const update = async (truckId: string'
const PAGE_LAST = "      .catch(() => { setCheckingSession(false); setDenied(true) })\n  }, [])\n\n"
function pageBefore() {
  const old = require('child_process').execFileSync('git', ['show', `${BASE}:${PAGE}`], { cwd: require('path').resolve(__dirname, '..'), maxBuffer: 64e6 }).toString()
  const i = old.indexOf('  const load = async () => {'), j = old.indexOf(PAGE_END_BEFORE)
  return i < 0 || j < 0 ? null : old.slice(i, j)
}

const FILES = ['lib/country-settings.ts', PAGE]

/** The file with admin-speed-1's edit put back, or null if the edit is not there exactly as made. Other files: unchanged. */
function undoCode(file, src) {
  if (!FILES.includes(file)) return src
  if (file === PAGE) {
    const i = src.indexOf(PAGE_START), j = src.indexOf(PAGE_END_BEFORE)
    if (i < 0 || src.indexOf(PAGE_START, i + 1) >= 0 || j < i || !src.slice(i, j).endsWith(PAGE_LAST)) return null
    const before = pageBefore()
    return before === null ? null : src.slice(0, i) + before + src.slice(j)
  }
  const i = src.indexOf(START)
  if (i < 0 || src.indexOf(START, i + 1) >= 0) return null
  const j = src.indexOf(END, i)
  if (j < 0 || src.indexOf(END, j + 1) >= 0) return null
  return src.slice(0, i) + BEFORE + src.slice(j + END.length)
}

module.exports = { undoCode, FILES }
