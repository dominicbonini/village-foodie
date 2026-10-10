// app/api/places/_guard.ts — what both Places routes check before spending a Google call.
// 1. The country is one trucks can sign up in (country_settings.enabled) — the box only ever asks about one.
// 2. The caller is within the places rate limit (lib/ratelimit.ts placesRatelimit). Fail OPEN if Redis is
//    unreachable (a person typing their town is not turned away by our infrastructure), and skip it on
//    loopback / in development, exactly as /api/demo does.
import type { NextRequest } from 'next/server'
import { getCountrySettings } from '@/lib/country-settings'
import type { CountrySettings } from '@/lib/country-settings-types'
import { placesRatelimit } from '@/lib/ratelimit'

export async function placesGuard(req: NextRequest, country: string): Promise<{ ok: true; settings: CountrySettings } | { ok: false; reason: string }> {
  let settings: CountrySettings
  try { settings = await getCountrySettings(country) } catch { return { ok: false, reason: 'unknown country' } }
  if (!settings.enabled) return { ok: false, reason: 'country not open' }
  const fwd = req.headers.get('x-forwarded-for')
  const ip = fwd ? fwd.split(',')[0].trim() : '127.0.0.1'
  const isDev = process.env.NODE_ENV !== 'production'
  const isLoopback = !fwd || ip === '127.0.0.1' || ip === '::1'
  if (!isDev && !isLoopback) {
    try {
      const { success } = await placesRatelimit.limit(`places:${ip}`)
      if (!success) return { ok: false, reason: 'rate limited' }
    } catch (e) {
      console.error('[places] rate limiter unreachable — failing open:', e instanceof Error ? e.message : e)
    }
  }
  return { ok: true, settings }
}

/** A session token the browser made (crypto.randomUUID). Anything else gets none — Google then bills per request. */
export const sessionTokenOf = (v: string | null): string => (v && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : '')
