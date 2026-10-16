import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// Language Phase 1d: a refusal of ours is `{ error: <today's English>, …, code, params }` (lib/i18n/manage-errors.ts), in the
// truck's language (en-GB before the truck is known). A database's or exception's message is passed on as it comes.
import { manageErrorBody } from '@/lib/i18n/manage-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('eventId')
  const token = req.nextUrl.searchParams.get('token')

  if (!eventId || !token) {
    return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'missing_params'), { status: 400 })
  }

  // Verify token belongs to a real truck
  const { data: truck } = await supabase
    .from('trucks')
    .select('id')
    .eq('dashboard_token', token)
    .single()

  if (!truck) return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'unauthorised'), { status: 401 })

  // Count active orders for this event.
  // 'modified' ADDED: this number is shown to an operator before a destructive event action, and an edited
  // order is every bit as affected as an unedited one. Omitting it under-reported the consequence.
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('truck_id', truck.id)
    .in('status', ['pending', 'confirmed', 'modified'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ count: count ?? 0 })
}
