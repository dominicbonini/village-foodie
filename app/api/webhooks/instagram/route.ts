import { NextRequest, NextResponse } from 'next/server'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

// Meta verification challenge
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook/instagram] verified')
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Incoming messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[webhook/instagram] incoming:', JSON.stringify(body, null, 2))

    const entry     = body?.entry?.[0]
    const messaging = entry?.messaging?.[0]

    if (!messaging?.message?.text) {
      return NextResponse.json({ ok: true })
    }

    const senderId   = messaging.sender?.id
    const text       = messaging.message.text
    const igAccountId = entry?.id

    if (!senderId || !igAccountId) {
      return NextResponse.json({ ok: true })
    }

    // TODO: Route to classifier
    console.log('[webhook/instagram] message from:', senderId, 'text:', text)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/instagram] error:', err)
    return NextResponse.json({ ok: true }) // always 200 to Meta
  }
}
