// APNs sender (Package 5, server side). Token-based (.p8) auth over HTTP/2.
//
// ⚠️ CANNOT BE VALIDATED WITHOUT: the APNs auth key (.p8) + Key ID + Team ID + the app's bundle id, the
// Push Notifications capability/entitlement on the iOS app, and a physical device to receive. Until
// APNS_* env is set this is a SAFE NO-OP (logs + returns), so shipping the trigger cannot break the order
// save. The JWT signing + HTTP/2 transport below are written blind and must be smoke-tested on a real
// device in the paid-account phase.
import http2 from 'node:http2'
import crypto from 'node:crypto'

interface ApnsConfig { keyId: string; teamId: string; bundleId: string; key: string; host: string }

function apnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const bundleId = process.env.APNS_BUNDLE_ID
  // .p8 contents (PEM). Support literal newlines or \n-escaped env storage.
  const key = process.env.APNS_KEY?.replace(/\\n/g, '\n')
  if (!keyId || !teamId || !bundleId || !key) return null
  const host = process.env.APNS_ENV === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com'
  return { keyId, teamId, bundleId, key, host }
}

// ES256 provider JWT (iss=teamId, kid=keyId). Valid ~1h; regenerated per batch (fine at this volume).
function providerToken(cfg: ApnsConfig): string {
  const header = { alg: 'ES256', kid: cfg.keyId }
  const payload = { iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) }
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const signingInput = `${b64(header)}.${b64(payload)}`
  const sig = crypto.sign('SHA256', Buffer.from(signingInput), { key: cfg.key, dsaEncoding: 'ieee-p1363' })
  return `${signingInput}.${sig.toString('base64url')}`
}

export interface OrderPendingPush { orderKey: string; orderNumber: string | number; truckName: string }

/**
 * Send "order needs confirming" to each device token. Returns which tokens APNs rejected as
 * BadDeviceToken/Unregistered so the caller can clean them (stale-device handling). Never throws.
 */
export async function sendOrderPendingPush(
  tokens: string[],
  payload: OrderPendingPush,
): Promise<{ sent: number; invalidTokens: string[]; skipped?: string }> {
  const cfg = apnsConfig()
  if (!cfg) { console.warn('[apns] not configured — skipping push (safe no-op)'); return { sent: 0, invalidTokens: [], skipped: 'not-configured' } }
  if (!tokens.length) return { sent: 0, invalidTokens: [] }

  const jwt = providerToken(cfg)
  const body = JSON.stringify({
    aps: { alert: { title: 'New order to confirm', body: `Order ${payload.orderNumber} — ${payload.truckName}` }, sound: 'default', 'content-available': 1 },
    type: 'order_pending', orderKey: payload.orderKey,   // custom keys → tap deep-link
  })

  const client = http2.connect(cfg.host)
  const invalidTokens: string[] = []
  let sent = 0
  try {
    await Promise.all(tokens.map(token => new Promise<void>(resolve => {
      const req = client.request({
        ':method': 'POST', ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`, 'apns-topic': cfg.bundleId, 'apns-push-type': 'alert',
      })
      let status = 0, data = ''
      req.on('response', h => { status = Number(h[':status']) || 0 })
      req.on('data', c => { data += c })
      req.on('end', () => {
        if (status === 200) sent++
        else { try { const r = JSON.parse(data || '{}'); if (r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') invalidTokens.push(token) } catch {} }
        resolve()
      })
      req.on('error', () => resolve())
      req.end(body)
    })))
  } catch (e) { console.warn('[apns] send failed:', (e as Error).message) }
  finally { try { client.close() } catch {} }
  return { sent, invalidTokens }
}
