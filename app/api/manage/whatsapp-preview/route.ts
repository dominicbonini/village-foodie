// app/api/manage/whatsapp-preview/route.ts
// OPERATOR-FACING PREVIEW OF THE WHATSAPP AUTO-REPLY. It calls the SAME function the live webhook
// calls -- `generateWhatsAppReply` -- and returns the string it produces. Nothing is sent to Meta and
// nothing is written to any table.
//
// ── 🔴 THE FIDELITY RULE, WHICH IS THE WHOLE POINT OF THIS ROUTE ────────────────────────────────────
// There is no second classifier, no demo prompt and no copied logic. A demo path and a real path drift,
// and the drift surfaces as the preview promising behaviour the live reply does not have. If you are
// ever tempted to "simplify" this by inlining a cheaper version, that is the thing this route exists to
// prevent. Same function, same guards, same grounded answerer.
//
// ── 🔴 IT WRITES NOTHING. NOT EVER. NOT whatsapp_logs. ──────────────────────────────────────────────
// `generateWhatsAppReply` performs no database write of any kind (it reads menu_items_db and calls
// Gemini). The log insert lives in the webhook route, not in the shared function, which is exactly what
// makes this route cheap and safe. A preview row in whatsapp_logs would do two bad things: it would be
// counted as a real customer interaction by the Reports tab's classification/possible_miss aggregation,
// and -- if it ever carried a real customer's number -- it would suppress that customer's greeting for
// the rest of the day, because the webhook's isFollowUp read keys on (customer_number, truck_id) and a
// non-null response_sent. See docs/whatsapp-simulator-seam-report.md 3.c and Q4.
//
// ── 🔴 NO truckId IS ACCEPTED FROM THE REQUEST. THE TRUCK COMES FROM THE TOKEN. ─────────────────────
// `generateWhatsAppReply` reads menu_items_db with a SERVICE-ROLE client scoped by nothing but the
// truckId it is handed. A body-supplied id would therefore read any truck's menu. The token is the only
// identity this route trusts, exactly as /api/manage does.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { generateWhatsAppReply } from '@/lib/whatsapp-classifier'
import { fetchUpcomingTruckEvents } from '@/lib/whatsapp/upcoming-events'

// Worst case is two sequential Gemini calls: the classifier at GEMINI_TIMEOUT_MS plus either the tier-3
// answerer at its own fixed 8000 or the SPECIFIC_QUERY reply at GEMINI_TIMEOUT_MS -- about 17s with
// overhead. The platform default (10s Hobby / 15s Pro) is below that, so a slow-but-succeeding preview
// would 504 before returning. Set explicitly, the same reasoning app/api/demo/route.ts records.
export const maxDuration = 60

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ── THE ABORT BUDGET ────────────────────────────────────────────────────────────────────────────────
// 8000ms, chosen to MATCH the tier-3 menu answerer's own long-standing 8000 rather than to invent a
// second number. It is passed as `timeoutMs` and reaches the two callGemini sites that never had one.
//
// ⚠️ AN ABORT DOES NOT SURFACE AS AN ERROR, AND THAT IS CORRECT. The classifier's catch falls to
// MENU_QUERY and the SPECIFIC_QUERY catch returns its deterministic fallback -- so a slow Gemini yields
// a REAL, deterministic reply rather than a failure, which is precisely what a customer would get. What
// the timeout actually buys is a BOUNDED ROUTE: without it, a hung call has nothing to abort it and the
// operator gets a spinner that never resolves.
const GEMINI_TIMEOUT_MS = 8000

// ── THE INPUT CAP ───────────────────────────────────────────────────────────────────────────────────
// 1000 characters. WhatsApp's own text message body limit is 4096, so this is comfortably inside what a
// real customer could send, and far past any real menu or schedule question (the example chips are ~20).
// It is here because there is NO length cap anywhere on the live path -- `customerMessage` is
// interpolated raw into up to three Gemini prompts -- and the live path's only bound is Meta's, which a
// browser-facing route does not inherit.
// ⚠️ HONEST LIMITATION: this cap does not exist on the live path, so the preview CANNOT reproduce a
// message between 1000 and 4096 characters. That is a deliberate trade of fidelity for a bounded bill.
const MAX_MESSAGE_CHARS = 1000

// ── THE RATE LIMIT ──────────────────────────────────────────────────────────────────────────────────
// 🔴 THIS ROUTE INHERITS NO LIMIT FROM proxy.ts AND MUST NOT BE ADDED THERE. proxy.ts limits a POSITIVE
// ALLOWLIST of public, bulk-scrapeable paths (/api/discovery*, /api/events exact, /trucks*); operator
// surfaces are structurally excluded. That allowlist is for public scrape targets and must not grow an
// authenticated operator route. So the limit lives here.
//
// ⚠️ KEYED ON THE TRUCK, NOT ON THE IP -- and that is a BETTER key than the public routes can use.
// proxy.ts's own comment laments having no customer identity to key on; this route is authenticated, so
// it has one. Keying on the truck means one operator cannot exhaust another's budget, and two operators
// behind one office address do not collapse into a single bucket. The truck ID is used, never the
// dashboard token: the token is a bearer credential and must not end up in a Redis key or a log line.
//
// 30 PER HOUR, sized against the worst LEGITIMATE session rather than the best: three example chips plus
// five or six typed questions is ~9; an operator who comes back and does it all again is ~18. 30 leaves
// headroom over that and still caps the spend at 60 Gemini calls per hour per truck. Anything past it is
// a held-down button or a script, and the refusal is recoverable by waiting.
const previewRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, '1 h'),
  analytics: true,
  prefix: 'vf_rl_wa_preview',
})

// ── 🔴 EVERY LOG LINE FROM THIS ROUTE IS TAGGED `[whatsapp-preview]` ────────────────────────────────
// The shared function's own lines (`[whatsapp menu query]`, `[WhatsApp classifier] Gemini error:`) will
// appear interleaved with real customer traffic and cannot be retagged from here without touching the
// live path. This route's own lines at least say which side they came from, so nobody diagnoses a live
// WhatsApp outage from a log stream that silently mixes real customers with operator previews.
const TAG = '[whatsapp-preview]'

export async function POST(req: NextRequest) {
  let body: { token?: unknown; message?: unknown }
  try {
    body = (await req.json()) as { token?: unknown; message?: unknown }
  } catch {
    return NextResponse.json({ ok: false, kind: 'bad_request', error: 'The request body was not valid JSON.' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) {
    return NextResponse.json({ ok: false, kind: 'unauthorised', error: 'Token required' }, { status: 401 })
  }

  // 🔴 THE TRUCK COMES FROM THE TOKEN AND FROM NOTHING ELSE. There is deliberately no `body.truckId`
  // read anywhere in this file -- see the header note about the service-role menu read.
  const { data: truck } = await supabase
    .from('trucks')
    .select('id, name, slug, truck_emoji')
    .eq('dashboard_token', token)
    .single()

  if (!truck) {
    return NextResponse.json({ ok: false, kind: 'unauthorised', error: 'Invalid token' }, { status: 401 })
  }

  const raw = typeof body.message === 'string' ? body.message : ''
  const message = raw.trim()
  if (!message) {
    return NextResponse.json({ ok: false, kind: 'empty', error: 'Type a question first.' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({
      ok: false,
      kind: 'too_long',
      error: `That message is ${message.length} characters. Keep a test message under ${MAX_MESSAGE_CHARS}.`,
    }, { status: 400 })
  }

  // Dev bypass mirrors app/api/demo/route.ts: a developer exercising this locally would otherwise burn
  // the hourly budget in one sitting.
  if (process.env.NODE_ENV === 'production') {
    try {
      const { success } = await previewRatelimit.limit(truck.id)
      if (!success) {
        console.warn(`${TAG} RATE LIMITED truck=${truck.id} -- 30/hour reached`)
        return NextResponse.json({
          ok: false,
          kind: 'rate_limited',
          error: 'You have run quite a few previews. Try again in a little while.',
        }, { status: 429, headers: { 'Retry-After': '3600' } })
      }
    } catch (err) {
      // Redis unreachable → FAIL OPEN, the same direction app/api/demo/route.ts takes and for the same
      // reason: an operator blocked by our own infrastructure is worse than a brief loss of throttling,
      // and the length cap and the auth gate both still apply.
      console.error(`${TAG} rate-limit check failed, allowing through:`, err)
    }
  }

  // The SAME schedule window the live webhook grounds its answers on -- one shared definition, not a
  // third copy. See lib/whatsapp/upcoming-events.ts.
  const events = await fetchUpcomingTruckEvents(supabase, truck.id)

  const hgUrl = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''
  const orderUrl = truck.slug ? `${hgUrl}/trucks/${truck.slug}/order` : ''

  console.log(`${TAG} truck=${truck.id} chars=${message.length} events=${events.length}`)

  try {
    const { reply, classification } = await generateWhatsAppReply({
      truckName:       truck.name,
      truckEmoji:      truck.truck_emoji ?? '',
      truckId:         truck.id,
      customerMessage: message,
      events,
      // Both URLs are the same string on the live path; reproduced rather than "improved".
      scheduleUrl:     orderUrl,
      orderUrl,
      // 🔴 ALWAYS false. The live value is computed from a whatsapp_logs read keyed on the CUSTOMER's
      // number, and this route has no customer. false = "first message of the day", which is the
      // greeting an operator is trying to preview. The sender identity is not a parameter of the shared
      // function at all, so there is nothing here that could reach a real customer's greeting state.
      isFollowUp:      false,
      timeoutMs:       GEMINI_TIMEOUT_MS,
    })

    console.log(`${TAG} truck=${truck.id} classification=${classification} replyChars=${reply?.length ?? 0}`)

    // 🔴 `reply: null` IS A CORRECT OUTCOME, NOT A FAILURE. It is the IGNORE bucket -- spam, gibberish,
    // catering requests -- doing its job, and the live path sends nothing in that case. It travels back
    // as `ok: true` with a null reply so the page can say so, rather than as an error.
    return NextResponse.json({ ok: true, reply, classification })
  } catch (err) {
    // The shared function catches its own Gemini failures and degrades to deterministic replies, so
    // reaching here means something structural (the menu read throwing, a bad env). Reported as itself.
    console.error(`${TAG} truck=${truck.id} FAILED:`, err)
    return NextResponse.json({
      ok: false,
      kind: 'failed',
      error: 'Could not build a preview just now. Try again in a moment.',
    }, { status: 500 })
  }
}
