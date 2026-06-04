import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractScheduleEvents } from '@/lib/schedule-extract'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const token = formData.get('token') as string | null
  const file = formData.get('file') as File | null
  const text = formData.get('text') as string | null

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  const { data: truck } = await supabase
    .from('trucks')
    .select('id')
    .eq('dashboard_token', token)
    .single()

  if (!truck) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    let events
    if (file && file.size > 0) {
      const buffer = await file.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      events = await extractScheduleEvents({ mimeType: file.type, base64 })
    } else {
      events = await extractScheduleEvents(text ?? '')
    }
    return NextResponse.json({ events })
  } catch (err) {
    console.error('[process-schedule] error:', err)
    return NextResponse.json({ error: 'Failed to extract events' }, { status: 500 })
  }
}
