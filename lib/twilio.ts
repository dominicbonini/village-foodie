// lib/twilio.ts
import { supabase } from './supabase'

const accountSid = process.env.TWILIO_ACCOUNT_SID!
const authToken  = process.env.TWILIO_AUTH_TOKEN!
const fromWa     = process.env.TWILIO_WHATSAPP_NUMBER!

const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
const auth    = () => Buffer.from(`${accountSid}:${authToken}`).toString('base64')

export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth()}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To:   toFormatted,
      From: fromWa,
      Body: body,
    }).toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Twilio error ${res.status}: ${(err as any).message || res.statusText}`)
  }
}

export async function logMessage(params: {
  orderId?: string
  direction: 'inbound' | 'outbound'
  channel:   'whatsapp' | 'sms' | 'email'
  from:      string
  to:        string
  body:      string
}): Promise<void> {
  try {
    await supabase.from('messages').insert({
      order_id:    params.orderId ?? null,
      direction:   params.direction,
      channel:     params.channel,
      from_number: params.from,
      to_number:   params.to,
      body:        params.body,
    })
  } catch (err) {
    console.error('logMessage failed:', err)
  }
}