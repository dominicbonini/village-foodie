// app/api/admin/countries/route.ts — the admin Countries page's four routes.
//
//   GET     every country + its truck count, uncached
//   PUT     save ONE country       { code, expectedUpdatedAt, form }
//   POST    add a country          { code, name, copyFrom }
//   DELETE  remove a country       { code }   — no trucks, switched off, never the marketing country
//
// 🔴 ADMIN ONLY, SERVICE ROLE, SERVER ONLY. public.country_settings has RLS on and no policies (V12.1), so
// the browser never touches it; this route is the only writer. Every rule is checked in
// lib/admin/country-actions.ts with a plain sentence before any write; a database error is logged and
// answered with a plain sentence too, never passed through.
// ⚠️ After every write: clearCountrySettingsCache(), so this instance's price surfaces change at once and
// every other within the loader's 60-second cache.

import { NextRequest, NextResponse } from 'next/server'
import { adminUser } from '@/lib/auth/admin'
import { clearCountrySettingsCache } from '@/lib/country-settings'
import { serviceCountryStore } from '@/lib/admin/country-store'
import { listCountries, saveCountry, addCountry, removeCountry, type ActionResult } from '@/lib/admin/country-actions'
import { MARKETING_COUNTRY } from '@/lib/marketing-country'

export const dynamic = 'force-dynamic'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

function reply<T>(r: ActionResult<T>) {
  return r.ok
    ? NextResponse.json(r.data)
    : NextResponse.json({ error: r.error, errors: r.errors ?? [] }, { status: r.status })
}

async function guarded<T>(req: NextRequest, run: (stamp: { by: string; at: string }) => Promise<ActionResult<T>>, writes: boolean) {
  const user = await adminUser(req)
  if (!user) return notFound()
  try {
    const r = await run({ by: user.email ?? user.id, at: new Date().toISOString() })
    if (writes && r.ok) clearCountrySettingsCache()
    return reply(r)
  } catch (e) {
    console.error('[admin/countries]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'That could not be saved just now. Nothing was changed — try again in a moment.' }, { status: 500 })
  }
}

const body = async (req: NextRequest): Promise<Record<string, unknown>> => {
  try { const b = await req.json(); return b && typeof b === 'object' ? b : {} } catch { return {} }
}

export async function GET(req: NextRequest) {
  return guarded(req, () => listCountries(serviceCountryStore, MARKETING_COUNTRY), false)
}

export async function PUT(req: NextRequest) {
  const b = await body(req)
  return guarded(req, stamp => saveCountry(serviceCountryStore, b, stamp), true)
}

export async function POST(req: NextRequest) {
  const b = await body(req)
  return guarded(req, stamp => addCountry(serviceCountryStore, b, stamp), true)
}

export async function DELETE(req: NextRequest) {
  const b = await body(req)
  return guarded(req, () => removeCountry(serviceCountryStore, b, [MARKETING_COUNTRY]), true)
}
