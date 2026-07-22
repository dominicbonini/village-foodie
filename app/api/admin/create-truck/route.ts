// app/api/admin/create-truck/route.ts
// Admin-only truck creation. The FIRST caller of lib/provision-truck — deliberately admin-gated so the
// create path can be proven on a real onboarding, with a human watching, before anonymous demo traffic
// ever drives it (prod `trucks` has constraints the code doesn't always match, and that's where drift
// bites — sheet_id being NOT NULL with no default is the live example).
//
// Uses the canonical verifyAdmin (session cookie, Bearer fallback for the native app). NOTE: the sibling
// create-operator route still does its own inline operators.is_admin lookup — same effect, but new code
// should use the shared helper. Converging that one is a separate tidy-up.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { provisionTruck, ProvisionError, type ProvisionTruckOptions } from '@/lib/provision-truck'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const kind = (body.kind as ProvisionTruckOptions['kind']) ?? 'operator'
  if (kind !== 'operator' && kind !== 'demo') {
    return NextResponse.json({ error: 'kind must be "operator" or "demo"' }, { status: 400 })
  }

  const visibility = body.visibility as ProvisionTruckOptions['visibility']
  if (visibility !== undefined && visibility !== 'hidden' && visibility !== 'public') {
    return NextResponse.json({ error: 'visibility must be "hidden" or "public"' }, { status: 400 })
  }

  // van: false → bare truck (no van). Otherwise an options object, or omitted for the defaults.
  const van = body.van === false
    ? false as const
    : (body.van as ProvisionTruckOptions['van']) ?? undefined

  try {
    const result = await provisionTruck(supabase, {
      kind,
      name: body.name as string | undefined,
      slug: body.slug as string | undefined,
      plan: body.plan as ProvisionTruckOptions['plan'],
      visibility,
      contactEmail: (body.contactEmail as string | null | undefined) ?? null,
      cuisineType: (body.cuisineType as string | null | undefined) ?? null,
      van,
    })

    // ⚠️ dashboard_token is a SECRET and is in this response by necessity (it's how the admin reaches the
    // truck). It is never logged server-side; the console should render it once behind a copy button, the
    // same pattern create-operator uses for tempPassword.
    return NextResponse.json({
      ok: true,
      truck: result.truck,
      van: result.van,
      urls: {
        manage: `/manage/${result.truck.dashboard_token}`,
        dashboard: `/dashboard/${result.truck.dashboard_token}`,
        order: `/trucks/${result.truck.slug}/order`,
      },
      warnings: result.warnings,
    })
  } catch (err) {
    if (err instanceof ProvisionError) {
      // orphanTruckId set → a truck row was created and the rollback ALSO failed. Surface the id in the
      // response so it's recoverable without a log dive.
      if (err.orphanTruckId) {
        return NextResponse.json(
          { error: err.message, code: err.code, orphanTruckId: err.orphanTruckId },
          { status: 500 },
        )
      }
      const status =
        err.code === 'validation' || err.code === 'reserved_prefix' ? 400
        : err.code === 'unique_exhausted' ? 409
        : 500
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    console.error('[create-truck] unexpected failure:', err)
    return NextResponse.json({ error: 'Truck creation failed' }, { status: 500 })
  }
}
