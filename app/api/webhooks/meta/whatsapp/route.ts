import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canAccess, type Plan } from '@/lib/features'
import { generateWhatsAppReply } from '@/lib/whatsapp-classifier'
import { sendMetaWhatsApp } from '@/lib/meta-whatsapp'
import { getLocalDateInTz, localDateOfInstant } from '@/lib/time-utils'
import { parseMetaAppSecrets, verifyMetaSignature, metaRefusalLog } from '@/lib/meta/webhook-signature'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The columns both truck lookups below read. Declared ONCE: two queries that select different shapes
// is how a fallback path starts returning a row the code downstream cannot use.
const TRUCK_FIELDS = `
  id, name, slug, truck_emoji,
  whatsapp_sender, whatsapp, phone_number_id,
  plan, feature_overrides, trial_expires_at
`

interface TruckRow {
  id: string
  name: string
  slug: string | null
  truck_emoji: string | null
  whatsapp_sender: string | null
  whatsapp: string | null
  phone_number_id: string | null
  plan: Plan
  feature_overrides: Record<string, boolean> | null
  trial_expires_at: string | null
}

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
//
// THE RAW BODY. THIS IS THE ONE THAT BITES, AND THIS ROUTE USED TO GET IT WRONG BY DEFAULT.
// `await req.text()` is called FIRST and `req.json()` is never called. Two reasons, and only the second
// is widely known:
//   1. The body is a STREAM AND CAN ONLY BE READ ONCE. The previous `await req.json()` on this line
//      consumed it; a later req.text() would throw "Body is unusable". There is no way back.
//   2. Even if you could, re-serialising is fatal. `JSON.stringify(JSON.parse(body))` is a DIFFERENT
//      STRING from what Meta signed, so the HMAC differs and verification fails 100% of the time WITH A
//      CORRECT SECRET. It presents as "my app secret must be wrong".
// NOTHING ELSE ABOUT THIS HANDLER CHANGED. The parse below produces the same `body` the old first line
// did; every step after it — the truck lookup, the plan gate, the greeting read, the classifier, the log
// insert and the send — is byte-identical and deliberately untouched.
//
// NOTE ON THE COMMENT STYLE IN THIS BLOCK: no coloured markers, deliberately. This file's non-ASCII
// vocabulary was an em dash and a right arrow, and the house marker glyphs would have added four new
// codepoint classes to it. Naming a rule is not a licence to break it.
export async function POST(req: NextRequest) {
  // FIRST LINE. Nothing may read the body before this.
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch (err) {
    console.error('[webhook/meta-whatsapp] REFUSED - could not read request body:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // THE GATE. THERE IS NO PATH AROUND THIS AND NO FLAG THAT SKIPS IT.
  // `rawBody` is NOT parsed, NOT inspected and NOT logged before this call — the only thing that happens
  // to an unverified body is that its LENGTH is measured for the refusal log. Deliberately no env-var
  // bypass and no development shortcut: this endpoint spends money at Meta AND at Google per request.
  // The SHA-1 `x-hub-signature` header is NOT read. See the downgrade note in the helper.
  const signatureHeader = req.headers.get('x-hub-signature-256')
  const secrets = parseMetaAppSecrets(process.env.META_APP_SECRET)
  const verification = verifyMetaSignature({ rawBody, signatureHeader, secrets })

  if (!verification.ok) {
    console.error(metaRefusalLog('meta-whatsapp', verification.reason, secrets.length, !!signatureHeader, rawBody.length))
    // 401, NOT 200. A forged request is not from Meta and will never read this, so the code is really an
    // instruction to META about GENUINE deliveries: a 2xx here would mean a misconfigured secret silently
    // swallowed every real message, which is exactly the APNs silent-skip failure this codebase has
    // already paid for once. A non-2xx makes Meta retry and eventually flag the subscription, which is
    // loud. The body says nothing — a caller probing this endpoint must not learn whether a secret is
    // configured or which check it tripped.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // VERIFIED. Only now is the body trusted enough to parse.
  try {
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      // Signed by Meta but not JSON. Not reachable in practice; refused rather than assumed.
      console.error('[webhook/meta-whatsapp] verified but body is not JSON')
      return NextResponse.json({ ok: true })
    }
    const parsed = body as any

    const entry    = parsed?.entry?.[0]
    const changes  = entry?.changes?.[0]
    const value    = changes?.value
    const messages = value?.messages

    if (!messages?.length) {
      // Status update or other non-message event — acknowledge and ignore
      return NextResponse.json({ ok: true })
    }

    const message       = messages[0]
    const from          = message.from as string  // the CUSTOMER, digits only, no + prefix
    const text          = message.type === 'text' ? (message.text?.body as string) : null
    // THE TWO IDENTIFIERS OF THE BUSINESS NUMBER THE CUSTOMER MESSAGED, both from Meta's metadata:
    //   phone_number_id      — opaque, stable, and what the send path addresses. THE ROUTING KEY.
    //   display_phone_number — the same number in human form. Used only by the fallback below.
    const phoneNumberId       = value?.metadata?.phone_number_id as string
    const displayPhoneNumber  = value?.metadata?.display_phone_number as string | undefined

    if (!text || !phoneNumberId) {
      return NextResponse.json({ ok: true })
    }

    // The customer's number is NOT logged. It is a phone number belonging to a member of the public and
    // nothing in this handler needs it in a log line to be diagnosable — the two identifiers below are
    // what tell you which truck a delivery was for.
    console.log('[webhook/meta-whatsapp] inbound for phone_number_id:', phoneNumberId)

    // ---- THE TRUCK LOOKUP: MATCHED ON THE NUMBER THE CUSTOMER MESSAGED *TO* ----
    // WHAT WAS WRONG, AND IT IS WORTH SPELLING OUT BECAUSE IT PASSED A LIVE TEST. This matched
    // `whatsapp_sender` — the TRUCK's own number — against `from`, which is the CUSTOMER's number:
    //     .or(fromVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
    // For any real customer that finds nothing. It only ever appeared to work because the tester's own
    // mobile was sitting in `whatsapp_sender`, which made the two values identical and the wrong field
    // look right. With two trucks it does something worse than nothing: it can match the OTHER truck.
    // The Twilio webhook in this repo has always done it correctly — `.eq('whatsapp_sender', toNumber)`,
    // the number messaged TO — and this is that, using the identifier Meta actually addresses.
    //
    // PRIMARY: phone_number_id. Opaque and stable, so there is no format to normalise and no ambiguity.
    // The partial unique index added in 20260816_trucks_phone_number_id.sql makes it impossible for two
    // trucks to claim the same one, so this can never return a second row.
    let truck: TruckRow | null = null
    {
      const { data } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .eq('phone_number_id', phoneNumberId)
        .eq('active', true)
        .maybeSingle()
      truck = (data as TruckRow | null) ?? null
    }

    // FALLBACK: the DISPLAYED number against whatsapp_sender, still the number messaged TO and never
    // the customer's. This exists because phone_number_id has NO UI and must be set by hand, so until a
    // truck's row is populated the primary lookup finds nothing. It is a bridge, not a second routing
    // rule — delete it once every WhatsApp truck has a phone_number_id.
    // The variants are the same three shapes the old code built, because whatsapp_sender is free text
    // and Pizzeria Gusto's is stored UK-national ('07380736226') while the field's placeholder is E.164.
    if (!truck && displayPhoneNumber) {
      const digits = displayPhoneNumber.replace(/\D/g, '')
      const toVariants = [
        `+${digits}`,
        digits,
        digits.startsWith('44') ? `0${digits.slice(2)}` : null,
      ].filter((v): v is string => v !== null)
      const { data } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .or(toVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
        .eq('active', true)
        .maybeSingle()
      truck = (data as TruckRow | null) ?? null
      if (truck) {
        console.warn(
          `[webhook/meta-whatsapp] routed by whatsapp_sender FALLBACK, not phone_number_id — ` +
          `truck=${truck.id} phone_number_id=${phoneNumberId} is not stored. Set it to retire this path.`,
        )
      }
    }

    if (!truck) {
      // NOT a silent discard. This names both identifiers, so the fix is a lookup rather than a guess:
      // set trucks.phone_number_id to the value below for whichever truck owns that display number.
      console.warn(
        `[webhook/meta-whatsapp] NO TRUCK for phone_number_id=${phoneNumberId} ` +
        `display=${displayPhoneNumber ?? 'absent'} — message dropped, nothing sent.`,
      )
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
