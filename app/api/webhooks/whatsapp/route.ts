import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canAccess } from '@/lib/features'
import { sendWhatsApp, logMessage } from '@/lib/twilio'
import { generateWhatsAppReply } from '@/lib/whatsapp-classifier'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Twilio sends webhooks as form-encoded POST
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const from = formData.get('From') as string  // e.g. whatsapp:+447700900000
    const to   = formData.get('To')   as string  // e.g. whatsapp:+14155238886
    const body = (formData.get('Body') as string || '').trim()

    if (!from || !to || !body) {
      console.log('[WA webhook] missing fields — from:', from, 'to:', to, 'body:', body)
      return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
    }

    const toNumber   = to.replace('whatsapp:', '')
    const fromNumber = from.replace('whatsapp:', '')
    console.log('[WA webhook] from:', fromNumber, 'to:', toNumber, 'body:', body)

    const { data: truck } = await supabase
      .from('trucks')
      .select(`
        id, name, slug, dashboard_token,
        whatsapp_sender, whatsapp,
        plan, feature_overrides, trial_expires_at
      `)
      .eq('whatsapp_sender', toNumber)
      .eq('active', true)
      .single()

    console.log('[WA webhook] truck found:', truck?.id, truck?.name)

    if (!truck) {
      console.warn('[WhatsApp webhook] No truck found for number:', toNumber)
      return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
    }

    console.log('[WA webhook] feature access:', canAccess(truck.plan, 'whatsapp_replies', truck.feature_overrides ?? {}, truck.trial_expires_at))

    if (!canAccess(truck.plan, 'whatsapp_replies', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: events } = await supabase
      .from('truck_events')
      .select('event_date, start_time, end_time, venue_name, town, postcode, status')
      .eq('truck_id', truck.id)
      .gte('event_date', today)
      .in('status', ['confirmed', 'open', 'unconfirmed'])
      .order('event_date', { ascending: true })
      .limit(10)

    console.log('[WA webhook] events found:', events?.length)

    const hgUrl = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''
    const { reply, classification } = await generateWhatsAppReply({
      truckName:       truck.name,
      truckId:         truck.id,
      customerMessage: body,
      events:          events ?? [],
      scheduleUrl:     truck.slug ? `${hgUrl}/trucks/${truck.slug}/order` : '',
      orderUrl:        truck.slug ? `${hgUrl}/trucks/${truck.slug}/order` : '',
    })

    console.log('[WA webhook] classification:', classification, 'reply:', reply)

    // Fire-and-forget interaction log — never let this block the response
    supabase.from('whatsapp_logs').insert({
      truck_id:       truck.id,
      customer_number: fromNumber,
      message_in:     body,
      classification,
      events_found:   events?.length ?? 0,
      response_sent:  reply ?? null,
      possible_miss:  classification === 'SPECIFIC_QUERY' && (events?.length ?? 0) === 0,
    }).then(({ error }) => {
      if (error) console.error('[WhatsApp] Logging failed:', error)
    })

    if (!reply) {
      // IGNORE bucket — log inbound but don't reply
      await logMessage({
        truckId:   truck.id,
        direction: 'inbound',
        channel:   'whatsapp',
        from:      fromNumber,
        to:        toNumber,
        body:      `[IGNORED] ${body}`,
      })
      return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
    }

    await sendWhatsApp(fromNumber, reply, toNumber)
    console.log('[WA webhook] reply sent')

    await logMessage({
      truckId:   truck.id,
      direction: 'inbound',
      channel:   'whatsapp',
      from:      fromNumber,
      to:        toNumber,
      body,
    })
    await logMessage({
      truckId:        truck.id,
      direction:      'outbound',
      channel:        'whatsapp',
      from:           toNumber,
      to:             fromNumber,
      body:           reply,
      inboundMessage: body,
    })
  } catch (err) {
    console.error('[WhatsApp webhook] Unhandled error:', err)
  }

  // Always return 200 — Twilio will retry on non-200
  return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
}
