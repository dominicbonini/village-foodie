// GET /api/setup/countries — the switched-on countries a truck can be created in, and the pre-filled guess
// (Phase 2D-1). PUBLIC: the demo modal's signup asks "Where's your truck based?" before an account exists.
// It returns names, zones, distance units, phone copy and flags — never a settings row.
import { NextRequest, NextResponse } from 'next/server'
import { signupCountries, guessSignupCountry } from '@/lib/signup-countries'
// Language Phase 1c: the refusal carries a code (lib/i18n/onboarding-errors.ts); no country is chosen yet, so en-GB.
import { onboardingErrorBody } from '@/lib/i18n/onboarding-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const countries = await signupCountries()
    const guess = guessSignupCountry(countries, req.headers.get('x-vercel-ip-country'))
    return NextResponse.json({ ok: true, countries, guess }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[setup/countries] could not list countries:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, ...onboardingErrorBody(DEFAULT_LOCALE, 'countries_unavailable') }, { status: 500 })
  }
}
