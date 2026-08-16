import { NextRequest, NextResponse } from 'next/server'

import { parseMetaAppSecrets, verifyMetaSignature, metaRefusalLog } from '@/lib/meta/webhook-signature'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN

// Meta verification challenge
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook/messenger] verified')
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Incoming messages
//
// THE RAW BODY IS READ FIRST AND req.json() IS NEVER CALLED. The body is a stream and can only be read
// once, so the previous `await req.json()` on the first line both consumed it and discarded the exact
// bytes Meta signed. Re-serialising is not a workaround: JSON.stringify(JSON.parse(body)) is a
// DIFFERENT STRING, so the HMAC differs and verification fails every time with a correct secret.
// NOTHING ELSE ABOUT THIS HANDLER CHANGED. It still acknowledges and logs, and still routes nothing to
// the classifier - the TODO below is untouched and deliberately out of scope.
export async function POST(req: NextRequest) {
  // FIRST LINE. Nothing may read the body before this.
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch (err) {
    console.error('[webhook/messenger] REFUSED - could not read request body:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // THE GATE. There is no path around this and no flag that skips it. rawBody is not parsed, not
  // inspected and not logged before this call - only its LENGTH is measured, for the refusal log.
  // The SHA-1 x-hub-signature header is deliberately NOT read; see the downgrade note in the helper.
  const signatureHeader = req.headers.get('x-hub-signature-256')
  const secrets = parseMetaAppSecrets(process.env.META_APP_SECRET)
  const verification = verifyMetaSignature({ rawBody, signatureHeader, secrets })

  if (!verification.ok) {
    console.error(metaRefusalLog('messenger', verification.reason, secrets.length, !!signatureHeader, rawBody.length))
    // 401, not 200. A forged request is not from Meta and will never read this, so the code is really an
    // instruction to META about GENUINE deliveries: a 2xx would mean a misconfigured secret silently
    // swallowed every real message. A non-2xx is loud. The body says nothing - a caller probing this
    // endpoint must not learn whether a secret is configured or which check it tripped.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // VERIFIED. Only now is the body trusted enough to parse.
  try {
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      console.error('[webhook/messenger] verified but body is not JSON')
      return NextResponse.json({ ok: true })
    }
    const parsed = body as any
    console.log('[webhook/messenger] incoming:', JSON.stringify(parsed, null, 2))

    const entry     = parsed?.entry?.[0]
    const messaging = entry?.messaging?.[0]

    if (!messaging?.message?.text) {
      return NextResponse.json({ ok: true })
    }

    const senderId = messaging.sender?.id
    const text     = messaging.message.text
    const pageId   = entry?.id

    if (!senderId || !pageId) {
      return NextResponse.json({ ok: true })
    }

    // TODO: Route to classifier
    console.log('[webhook/messenger] message from:', senderId, 'text:', text)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/messenger] error:', err)
    return NextResponse.json({ ok: true }) // always 200 to Meta
  }
}
