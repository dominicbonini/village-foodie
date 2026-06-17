import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canAccess } from '@/lib/features'
import { generateWhatsAppReply } from '@/lib/whatsapp-classifier'
import { sendMetaWhatsApp } from '@/lib/meta-whatsapp'
import { getLocalDateInTz, localDateOfInstant } from '@/lib/time-utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

// Meta webhook verification
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  console.log('[webhook/meta-whatsapp] verify attempt:', {
    mode,
    token,
    envToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
    match: token === VERIFY_TOKEN,
  })

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook/meta-whatsapp] verified')
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Incoming messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const entry    = body?.entry?.[0]
    const changes  = entry?.changes?.[0]
    const value    = changes?.value
    const messages = value?.messages

    if (!messages?.length) {
      // Status update or other non-message event — acknowledge and ignore
      return NextResponse.json({ ok: true })
    }

    const message       = messages[0]
    const from          = message.from as string  // digits only, no + prefix
    const text          = message.type === 'text' ? (message.text?.body as string) : null
    const phoneNumberId = value?.metadata?.phone_number_id as string

    if (!text || !phoneNumberId) {
      return NextResponse.json({ ok: true })
    }

    console.log('[webhook/meta-whatsapp] message from:', from, 'text:', text)

    // whatsapp_sender may be stored as +447..., 447..., or 07... (UK local).
    // Meta always sends digits only (e.g. 447941042253). Build all variants to match any format.
    const fromVariants = [
      `+${from}`,
      from,
      from.startsWith('44') ? `0${from.slice(2)}` : null,
    ].filter((v): v is string => v !== null)

    const { data: truck } = await supabase
      .from('trucks')
      .select(`
        id, name, slug, truck_emoji,
        whatsapp_sender, whatsapp,
        plan, feature_overrides, trial_expires_at
      `)
      .or(fromVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
      .eq('active', true)
      .single()

    if (!truck) {
      console.warn('[webhook/meta-whatsapp] no truck found for number:', from)
      return NextResponse.json({ ok: true })
    }

    if (!canAccess(truck.plan, 'whatsapp_replies', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      return NextResponse.json({ ok: true })
    }

    // FOLLOW-UP GREETING — greet ONCE per calendar day per sender (timezone-correct, never UTC-date).
    // Single tz swap point: → truck.timezone ?? 'Europe/London' once that column exists.
    const truckTz = 'Europe/London'
    // Read the most-recent PRIOR REPLIED row for this sender+truck. response_sent IS NOT NULL means a
    // reply actually went out, so an IGNORE/gibberish (logged, unreplied) does NOT suppress the
    // greeting on a later real question. Runs BEFORE the :116 log insert, so this message's own row
    // isn't present → no self-suppression. FAIL-OPEN: any error → greet (extra greeting is benign;
    // a wrongly-suppressed greeting reads as the bot acting mid-conversation when it isn't).
    let isFollowUp = false
    try {
      const { data: prior } = await supabase
        .from('whatsapp_logs')
        .select('created_at')
        .eq('customer_number', from)
        .eq('truck_id', truck.id)
        .not('response_sent', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      isFollowUp = !!prior && localDateOfInstant(prior.created_at, truckTz) === getLocalDateInTz(truckTz)
    } catch (err) {
      console.error('[webhook/meta-whatsapp] follow-up read failed (greeting):', err)
      isFollowUp = false
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

    const hgUrl = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''
    const { reply, classification } = await generateWhatsAppReply({
      truckName:       truck.name,
      truckEmoji:      truck.truck_emoji ?? '',
      truckId:         truck.id,
      customerMessage: text,
      events:          events ?? [],
      scheduleUrl:     truck.slug ? `${hgUrl}/trucks/${truck.slug}/order` : '',
      orderUrl:        truck.slug ? `${hgUrl}/trucks/${truck.slug}/order` : '',
      // Greet only on the sender's FIRST replied message of the day (computed above, fail-open).
      isFollowUp,
    })

    console.log('[webhook/meta-whatsapp] classification:', classification, 'reply:', reply)

    // Fire-and-forget interaction log — never blocks the response
    supabase.from('whatsapp_logs').insert({
      truck_id:        truck.id,
      customer_number: from,
      message_in:      text,
      classification,
      events_found:    events?.length ?? 0,
      response_sent:   reply ?? null,
      possible_miss:   classification === 'SPECIFIC_QUERY' && (events?.length ?? 0) === 0,
    }).then(({ error }) => {
      if (error) console.error('[webhook/meta-whatsapp] log failed:', error)
    })

    if (!reply) {
      // IGNORE bucket — logged above, no message sent
      return NextResponse.json({ ok: true })
    }

    try {
      await sendMetaWhatsApp(from, reply, phoneNumberId)
      console.log('[webhook/meta-whatsapp] reply sent')
    } catch (err) {
      console.error('[webhook/meta-whatsapp] send failed:', err)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/meta-whatsapp] error:', err)
    return NextResponse.json({ ok: true }) // always 200 — Meta retries on anything else
  }
}
