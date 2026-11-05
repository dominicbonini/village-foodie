// lib/revalidate-secret.ts — perf-1 (5 November 2026, docs/perf-1-report.md): /api/revalidate's secret check, in constant time.
// Both sides are hashed to 32 bytes first (SHA-256), so timingSafeEqual never depends on where they differ or on their lengths.
import 'server-only'
import { createHash, timingSafeEqual } from 'crypto'

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()

/** True when `given` (the request header) is exactly `expected` (REVALIDATE_SECRET). A missing header never matches. */
export function secretMatches(given: string | null, expected: string): boolean {
  const same = timingSafeEqual(digest(given ?? ''), digest(expected))
  return same && given !== null && expected.length > 0
}
