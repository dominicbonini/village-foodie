import { NextRequest, NextResponse } from 'next/server'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

// Meta verification challenge
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

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
    console.log('[webhook/meta-whatsapp] incoming:', JSON.stringify(body, null, 2))

    const entry    = body?.entry?.[0]
    const changes  = entry?.changes?.[0]
    const value    = changes?.value
    const messages = value?.messages

    if (!messages?.length) {
      // Not a message event (e.g. status update) — acknowledge and ignore
      return NextResponse.json({ ok: true })
    }

    const message       = messages[0]
    const from          = message.from // customer's phone number
    const text          = message.type === 'text' ? message.text?.body : null
    const phoneNumberId = value?.metadata?.phone_number_id

    if (!text || !phoneNumberId) {
      return NextResponse.json({ ok: true })
    }

    // TODO: Route to classifier
    // Will be wired to lib/whatsapp-classifier.ts in next step
    console.log('[webhook/meta-whatsapp] message from:', from, 'text:', text)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/meta-whatsapp] error:', err)
    return NextResponse.json({ ok: true }) // always 200 to Meta
  }
}
