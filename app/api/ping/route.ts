// Lightweight reachability probe for the native offline detector (lib/native/reachability.ts). Intentionally
// does NO auth, NO DB work — it exists only to answer "can this device reach the server right now?" cheaply.
// A 200 here means the app server is reachable (the truest offline signal for the outbox gate).
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function HEAD() {
  return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}

export function GET() {
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
