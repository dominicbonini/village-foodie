import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canAccess, type Plan } from '@/lib/features'
import { generateWhatsAppReply } from '@/lib/whatsapp-classifier'
import { sendMetaWhatsApp } from '@/lib/meta-whatsapp'
import { getLocalDateInTz, localDateOfInstant } from '@/lib/time-utils'
import { monthStartIso, truckTimezone } from '@/lib/whatsapp/usage'
import {
  decideReplyCap, type ReplyCapDecision, isCapClassification, handoffMessage,
  DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H, DEFAULT_MONTHLY_REPLY_LIMIT,
  CLASSIFICATION_CUSTOMER_CAP, CLASSIFICATION_CUSTOMER_NOTIFIED,
  CLASSIFICATION_TRUCK_MONTH_CAP,
} from '@/lib/whatsapp/reply-cap'
import { parseMetaAppSecrets, verifyMetaSignature, metaRefusalLog } from '@/lib/meta/webhook-signature'
import {
  resolveWhatsAppRoute, chooseSendCredential,
  type WhatsAppRoutePath,
} from '@/lib/whatsapp/inbound-route'
import { deriveWhatsAppConnectionState, canSendWhatsApp } from '@/lib/whatsapp/connection-state'
import { decryptToken } from '@/lib/whatsapp/token-crypto'
import { platformAccessToken } from '@/lib/meta-whatsapp'
import { isPaymentBlockedError } from '@/lib/meta-whatsapp'
import { usageAlertDue } from '@/lib/whatsapp/usage'
import { markPaymentBlocked, clearPaymentBlocked } from '@/lib/whatsapp/payment-block'
import { sendWhatsAppAlert, supabaseAlertStore, type WhatsAppAlertKind } from '@/lib/whatsapp/alerts'
import { limit80Email, limit100Email, paymentBlockedEmail } from '@/lib/whatsapp/alert-copy'
import { monthResetLocalDate } from '@/lib/whatsapp/usage'
import { usageMonthKey } from '@/lib/whatsapp/maintenance'
import { WHATSAPP_MANAGER_URL } from '@/lib/whatsapp/copy'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The columns both truck lookups below read. Declared ONCE: two queries that select different shapes
// is how a fallback path starts returning a row the code downstream cannot use.
// The whatsapp_connections columns this route reads. Same list as lib/whatsapp/connection-read.ts's
// CONNECTION_FIELDS, declared here rather than imported because that module reads BY TRUCK and this
// reads BY PHONE NUMBER — sharing the query would have meant a second signature on a module whose
// header says it answers one question.
const CONNECTION_FIELDS =
  'truck_id, waba_id, phone_number_id, access_token_ciphertext, token_expires_at, token_revoked_at, token_issued_at, payment_method_present'

interface ConnectionTokenRow {
  truck_id: string
  waba_id: string | null
  phone_number_id: string | null
  access_token_ciphertext: string | null
  token_expires_at: string | null
  token_revoked_at: string | null
  token_issued_at: string | null
  payment_method_present: boolean | null
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT HAPPENS AFTER A SEND — THE OPERATOR ALERTS
// ════════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 BOTH HELPERS ARE BEST-EFFORT AND NEITHER MAY THROW. They run after a customer's reply has already
// gone out (or failed), on a route where EVERY path must return 200 — a thrown error here would be
// caught by the outer handler and logged as though the reply itself had failed.

/**
 * The manage link for an operator email, fetched only when an email is actually being sent.
 * 🔴 `dashboard_token` IS A CREDENTIAL AND IS DELIBERATELY NOT IN TRUCK_FIELDS. It is read here, on the
 * rare alert path, rather than on every inbound customer message — so the hot path never holds it and
 * cannot leak it through a log line or a future response body. Same link shape the schedule-approval
 * email already uses.
 */
async function manageLinkFor(truckId: string): Promise<string> {
  const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''
  try {
    const { data } = await supabase.from('trucks').select('dashboard_token').eq('id', truckId).maybeSingle()
    const token = (data?.dashboard_token as string | null) ?? null
    return token ? `${base}/manage/${token}?tab=settings` : `${base}/manage`
  } catch {
    return `${base}/manage`
  }
}

/**
 * Called after META ACCEPTED a send. Two jobs: clear any billing block, and warn the operator if this
 * send has taken them to 80% or 100% of the month's allowance.
 * ⚠️ `countBefore` IS THE COUNT BEFORE THIS MESSAGE, so the count after it is +1. Null means the count
 * read failed earlier and no allowance email is sent at all — see the hoist comment.
 */
async function afterAcceptedSend(args: {
  truck: { id: string; name: string | null; contact_email: string | null; whatsapp_monthly_reply_limit: number | null; timezone: string | null }
  countBefore: number | null
  tz: string
}): Promise<void> {
  const { truck, countBefore, tz } = args
  // A send Meta accepted is proof the billing problem is over, whatever we recorded before.
  await clearPaymentBlocked(supabase, truck.id)

  if (countBefore === null) return
  const limit = truck.whatsapp_monthly_reply_limit ?? DEFAULT_MONTHLY_REPLY_LIMIT
  const kind = usageAlertDue(countBefore + 1, limit)
  if (!kind) return
  // No address, no email. Nullable on trucks, and blank on plenty of them.
  const to = truck.contact_email
  if (!to || !to.trim()) return

  try {
    const manageUrl = await manageLinkFor(truck.id)
    const name = truck.name || 'there'
    const resetLabel = monthResetLocalDate(tz)
    const email = kind === 'limit_100'
      ? limit100Email({ truckName: name, limit, resetLabel, manageUrl })
      : limit80Email({ truckName: name, used: countBefore + 1, limit, resetLabel, manageUrl })
    await sendWhatsAppAlert({
      store: supabaseAlertStore(supabase),
      kind: kind as WhatsAppAlertKind,
      truckId: truck.id,
      // 🔴 THE TRUCK'S LOCAL MONTH, the same window the allowance itself resets on. A UTC month key
      // would let the email fire for a month the counter has already rolled out of.
      periodKey: usageMonthKey(tz, new Date()),
      to,
      email,
    })
  } catch (e) {
    console.error(`[webhook/meta-whatsapp] allowance alert failed: ${truck.id} ${kind}`, e instanceof Error ? e.message : String(e))
  }
}

/**
 * Called after Meta REFUSED a send. Only one refusal means anything specific: 131042, no usable payment
 * method on the WABA.
 * ⚠️ EVERY OTHER ERROR FALLS STRAIGHT THROUGH. It has already been logged by the caller, and guessing at
 * a cause we cannot name would put a wrong banner in front of an operator.
 */
async function afterRefusedSend(args: {
  err: unknown
  truck: { id: string; name: string | null; contact_email: string | null; timezone: string | null }
  tz: string
}): Promise<void> {
  const { err, truck, tz } = args
  if (!isPaymentBlockedError(err)) return

  const marked = await markPaymentBlocked(supabase, truck.id, new Date().toISOString())
  // The column is not there yet (migration unapplied), or the write failed. Either way there is no
  // banner to back the email up, so nothing is sent — fail closed.
  if (!marked) return

  const to = truck.contact_email
  if (!to || !to.trim()) return
  try {
    const manageUrl = await manageLinkFor(truck.id)
    await sendWhatsAppAlert({
      store: supabaseAlertStore(supabase),
      kind: 'payment_blocked',
      truckId: truck.id,
      periodKey: usageMonthKey(tz, new Date()),
      to,
      email: paymentBlockedEmail({
        truckName: truck.name || 'there', manageUrl, whatsappManagerUrl: WHATSAPP_MANAGER_URL,
      }),
    })
  } catch (e) {
    console.error(`[webhook/meta-whatsapp] payment_blocked alert failed: ${truck.id}`, e instanceof Error ? e.message : String(e))
  }
}

const TRUCK_FIELDS = `
  id, name, slug, truck_emoji,
  whatsapp_sender, whatsapp, phone_number_id,
  plan, feature_overrides, trial_expires_at,
  whatsapp_monthly_reply_limit, timezone,
  contact_email
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
  whatsapp_monthly_reply_limit: number | null
  timezone: string | null
  /** Nullable, and blank on plenty of trucks — the allowance and payment emails skip when it is. */
  contact_email: string | null
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
  //
  // THE VARIABLE NAME IS `META_WHATSAPP_APP_SECRET` AND IT IS DELIBERATELY NOT A FALLBACK CHAIN.
  // It was `META_APP_SECRET` until 20 August 2026, which is a name PRODUCTION HAS NEVER DEFINED --
  // the Vercel environment defines `META_WHATSAPP_APP_SECRET`, matching the four sibling
  // `META_WHATSAPP_*` variables and the env RULE in the reference manual's Section 20. The old name
  // resolved to `undefined`, so `parseMetaAppSecrets` returned `[]` and the gate refused EVERY
  // genuine delivery with `reason=no_secret_configured` before the truck lookup was ever reached.
  // A chain reading `META_WHATSAPP_APP_SECRET ?? META_APP_SECRET` would have worked and is REFUSED
  // ON PURPOSE: accepting either name is what hides this exact drift the next time it happens.
  // One name, matching the family. Comma-separated multi-secret support is unchanged -- it lives in
  // the helper's parser, not in the name.
  const signatureHeader = req.headers.get('x-hub-signature-256')
  const secrets = parseMetaAppSecrets(process.env.META_WHATSAPP_APP_SECRET)
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
      // ── 🔴 NON-MESSAGE CHANGES ARE NOW NAMED, NOT SILENTLY SWALLOWED ──────────────────────────────
      // Everything without a `messages` array lands here: delivery statuses, template status updates,
      // account alerts — and `smb_message_echoes`, the coexistence field that carries an operator's own
      // reply typed in the WhatsApp Business app. Until now they were indistinguishable from each other
      // and from nothing arriving at all, so "is Meta even sending us echoes?" was unanswerable.
      //
      // 🔴 SHAPE ONLY, NEVER CONTENT. The field name and the TOP-LEVEL KEY NAMES of its value — no
      // values, no numbers, no text. An echo's value carries the operator's own message body and the
      // customer's number; a status carries the customer's number too. Logging keys answers "what is
      // arriving" without putting a single byte of anyone's conversation in a log aggregator.
      //
      // ⚠️ NO BEHAVIOUR IS ADDED FOR ECHOES. This is observation, deliberately. Acting on an echo means
      // deciding what an operator's own reply does to the reply cap and to the greeting's "first message
      // of the day" test, and that is a product decision, not a logging one.
      const nonMessageField = typeof changes?.field === 'string' ? changes.field : 'unknown'
      const valueKeys = value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(value as Record<string, unknown>).sort().join(',')
        : 'none'
      console.log(
        `[webhook/meta-whatsapp] non-message change field=${nonMessageField} value_keys=${valueKeys}`,
      )
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
    // 🔴 REWRITTEN 15 September 2026. THE DECISION IS NOW A PURE FUNCTION — `resolveWhatsAppRoute`
    // (lib/whatsapp/inbound-route.ts). This block FETCHES; it no longer DECIDES. The order, the conflict
    // case and the precedence are testable without a database, which is what they were not before.
    //
    // WHAT WAS WRONG ORIGINALLY, kept because it passed a live test: this matched `whatsapp_sender` —
    // the TRUCK's own number — against `from`, the CUSTOMER's number. It only ever appeared to work
    // because the tester's own mobile sat in `whatsapp_sender`, making the two values identical.
    //
    // THE ORDER, and why:
    //   1. connection      a READY whatsapp_connections row — a truck holding its OWN Meta credential.
    //                      It MUST win: answering it on the platform token would bill us for messages
    //                      the truck onboarded specifically in order to pay for itself.
    //   2. truck_column    trucks.phone_number_id, hand-set. The platform's Meta test number.
    //   3. sender_fallback the pre-existing whatsapp_sender bridge, unchanged.
    let truck: TruckRow | null = null
    let routePath: WhatsAppRoutePath | null = null
    let connectionRow: ConnectionTokenRow | null = null

    // ── (1) THE CONNECTION ROW. Service-role client, so RLS (service_role only) permits this read. ────
    {
      const { data, error } = await supabase
        .from('whatsapp_connections')
        .select(CONNECTION_FIELDS)
        .eq('phone_number_id', phoneNumberId)
        .maybeSingle()
      if (error) {
        // A lookup we could not complete is NOT a match — the same posture the two truck lookups take.
        console.error(
          `[webhook/meta-whatsapp] LOOKUP FAILED (whatsapp_connections) code=${error.code} ` +
          `message=${error.message} -> treated as no connection.`,
        )
      }
      connectionRow = (data as ConnectionTokenRow | null) ?? null
    }

    // ── (2) trucks.phone_number_id — the primary lookup, unchanged in shape. ──────────────────────────
    let truckColumnRow: TruckRow | null = null
    {
      const { data, error } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .eq('phone_number_id', phoneNumberId)
        .eq('active', true)
        .maybeSingle()
      // A QUERY THAT ERRORED IS NOT A QUERY THAT FOUND NOTHING. maybeSingle() errors on >1 row; the
      // partial unique index makes that unreachable HERE, but the fallback below has no such index and
      // the two sites must not diverge in how they read a result.
      if (error) {
        console.error(
          `[webhook/meta-whatsapp] LOOKUP FAILED (primary, phone_number_id) code=${error.code} ` +
          `message=${error.message} -> treated as no match; falling through to the fallback.`,
        )
      }
      truckColumnRow = (data as TruckRow | null) ?? null
    }

    // ── THE DECISION, minus the fallback, which is still fetched lazily. ──────────────────────────────
    // ⚠️ THE FALLBACK QUERY IS DELIBERATELY NOT RUN YET. It only ever ran when the primary found nothing,
    // and running it eagerly would add a query to every inbound for Thai Kitchen and every connected
    // truck. `senderFallbackTruckId: null` here asks the resolver the same question the old code asked.
    const firstPass = resolveWhatsAppRoute({
      phoneNumberId,
      connection: connectionRow
        ? {
            truckId: connectionRow.truck_id,
            phoneNumberId: connectionRow.phone_number_id,
            // 🔴 READINESS COMES FROM THE STATE MACHINE, NOT FROM A HAND-ROLLED TEST HERE.
            ready: canSendWhatsApp(deriveWhatsAppConnectionState({
              wabaId: connectionRow.waba_id,
              phoneNumberId: connectionRow.phone_number_id,
              tokenPresent: !!connectionRow.access_token_ciphertext,
              tokenExpiresAt: connectionRow.token_expires_at,
              tokenRevokedAt: connectionRow.token_revoked_at,
              tokenIssuedAt: connectionRow.token_issued_at,
              paymentMethodPresent: connectionRow.payment_method_present,
            })),
          }
        : null,
      truckColumnTruckId: truckColumnRow?.id ?? null,
      senderFallbackTruckId: null,
    })

    // 🔴 THE SAME NUMBER CLAIMED BY TWO DIFFERENT TRUCKS. Nothing is sent and nothing is guessed:
    // picking one would put one business's customer conversation in front of another business.
    if (firstPass.kind === 'conflict') {
      console.error(
        `[webhook/meta-whatsapp] ROUTING CONFLICT phone_number_id=${firstPass.phoneNumberId} ` +
        `connection_truck=${firstPass.connectionTruckId} truck_column_truck=${firstPass.truckColumnTruckId} ` +
        `— nothing sent, nothing guessed. Clear one of the two claims.`,
      )
      return NextResponse.json({ ok: true })
    }

    if (firstPass.kind === 'matched' && firstPass.path === 'connection') {
      routePath = 'connection'
      const { data, error } = await supabase
        .from('trucks').select(TRUCK_FIELDS).eq('id', firstPass.truckId).eq('active', true).maybeSingle()
      if (error) {
        console.error(
          `[webhook/meta-whatsapp] LOOKUP FAILED (connection truck) code=${error.code} message=${error.message}`,
        )
      }
      truck = (data as TruckRow | null) ?? null
      if (!truck) {
        // A connection pointing at a missing or inactive truck is a data fault, not a routing miss.
        console.warn(
          `[webhook/meta-whatsapp] connection row names truck=${firstPass.truckId} which is absent or ` +
          `inactive — nothing sent.`,
        )
        return NextResponse.json({ ok: true })
      }
    } else if (firstPass.kind === 'matched' && firstPass.path === 'truck_column') {
      routePath = 'truck_column'
      truck = truckColumnRow
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
      const { data, error } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .or(toVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
        .eq('active', true)
        .maybeSingle()
      // THIS IS THE SITE THE ERROR CHECK EXISTS FOR. whatsapp_sender carries NO unique index, so the
      // moment a SECOND truck is populated with a value matching any of the three variants, maybeSingle()
      // returns an error and no row. Discarding it made that arrive as a silent drop that looked exactly
      // like "no truck is set up on WhatsApp" -- the failure would have been diagnosed as configuration.
      // Logged distinctly, then fallen through: a lookup we could not complete is NOT a match.
      if (error) {
        console.error(
          `[webhook/meta-whatsapp] LOOKUP FAILED (fallback, display_phone_number) code=${error.code} ` +
          `message=${error.message} variants=${toVariants.length} -> treated as no match. ` +
          `A "more than one row" error here means two trucks share a whatsapp_sender variant.`,
        )
      }
      truck = (data as TruckRow | null) ?? null
      if (truck) {
        routePath = 'sender_fallback'
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

    // 🔴 ONE LINE PER INBOUND, NAMING THE PATH AND THE TRUCK. Which of the three routes answered is the
    // single most useful fact when a truck reports "it did not reply", and until now nothing recorded it.
    // ⚠️ NO CUSTOMER NUMBER AND NO MESSAGE TEXT — see the note above the identifiers. The truck id and the
    // path are enough to reproduce a routing decision; the customer's details are not ours to log.
    console.log(`[webhook/meta-whatsapp] routed path=${routePath ?? 'unknown'} truck=${truck.id}`)

    // 🔴 THE PLAN GATE NOW SAYS SO. It was a bare `return` — a customer messaged a truck on an expired
    // trial, nothing was sent, and NOTHING ANYWHERE recorded that a reply had been suppressed. That is
    // indistinguishable from the webhook never firing, which is how it would have been diagnosed.
    if (!canAccess(truck.plan, 'whatsapp_replies', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      console.warn(
        `[webhook/meta-whatsapp] PLAN GATE DENIED truck=${truck.id} plan=${truck.plan} ` +
        `feature=whatsapp_replies decision=deny — nothing sent.`,
      )
      return NextResponse.json({ ok: true })
    }

    // ── 🔴 THE SEND CREDENTIAL, RESOLVED BEFORE THE CLASSIFIER ───────────────────────────────────────
    // Deliberately here and not beside the send: `generateWhatsAppReply` is a MODEL CALL, and paying for
    // a reply we then discover we cannot deliver is money spent to produce nothing. Resolving first also
    // means the cap handoff below — which is itself a send — is covered by the same decision.
    //
    // 🔴 THE `connection` PATH NEVER FALLS BACK TO THE PLATFORM TOKEN. A truck that onboarded through
    // Embedded Signup did so to pay Meta directly; answering on our token would bill us for its messages
    // and make "trucks pay Meta directly" false. Unusable means SILENT — the operator is told through
    // Settings' Reconnect affordance (shouldOfferReauthorise covers `revoked`, which is also what an
    // elapsed expiry derives to), not by us quietly paying.
    //
    // ⚠️ `META_WHATSAPP_PHONE_NUMBER_ID` IS A NEW VARIABLE AND THE FALLBACK PATH DEPENDS ON IT. If it is
    // unset, every sender_fallback inbound refuses — which is Pizzeria Gusto's path today. It MUST be set
    // before this deploys. The refusal names itself so one log line diagnoses it.
    const credential = chooseSendCredential({
      path: routePath ?? 'sender_fallback',
      connectionToken: connectionRow
        ? {
            ciphertext: connectionRow.access_token_ciphertext,
            tokenExpiresAt: connectionRow.token_expires_at,
            tokenRevokedAt: connectionRow.token_revoked_at,
          }
        : null,
      platformToken: platformAccessToken(),
      inboundPhoneNumberId: phoneNumberId,
      platformPhoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? null,
      decrypt: decryptToken,
    })

    if (credential.kind === 'refuse') {
      // 🔴 NO TOKEN MATERIAL IN THE LOG. `reason` is a fixed sentence chosen by chooseSendCredential from
      // a closed set; it never carries ciphertext, key bytes or a decrypt error message.
      console.warn(
        `[webhook/meta-whatsapp] NO USABLE CREDENTIAL path=${routePath ?? 'unknown'} truck=${truck.id} ` +
        `reason=${credential.reason} — nothing sent, no model call made.`,
      )
      return NextResponse.json({ ok: true })
    }

    // FOLLOW-UP GREETING — greet ONCE per calendar day per sender (timezone-correct, never UTC-date).
    // Single tz swap point: → truck.timezone ?? 'Europe/London' once that column exists.
    // 🔴 THE TRUCK'S OWN TIMEZONE NOW, THROUGH THE SHARED HELPER. `trucks.timezone` is null on every
    // truck today, so 'Europe/London' is still the branch that runs — but it is a real fallback rather
    // than a hardcoded assumption, and the day the column is populated this follows it.
    const truckTz = truckTimezone(truck.timezone)

    // ── 🔴 ONE READ SERVES THE GREETING AND THE PER-CUSTOMER CAP. THAT EQUIVALENCE IS ARGUED, NOT
    //    ASSUMED. ──────────────────────────────────────────────────────────────────────────────────
    // The greeting previously read the single most-recent replied row for this sender+truck with NO
    // time bound, then asked whether its LOCAL DATE equals today's. Bounding that read to the rolling
    // 24 hours cannot change its answer:
    //   • Any row on the same local calendar day is necessarily LESS than 24 hours old, so no row the
    //     greeting would have said "yes" to can fall outside the window.
    //   • A row the window excludes is by definition >24h old, therefore on an earlier local date,
    //     therefore one the unbounded query would have answered "no" to anyway.
    // The most-recent row is still taken and the SAME date test is still applied, so the greeting's
    // behaviour is unchanged. The per-customer count then falls out of the same rows for free.
    // ⚠️ THE PER-TRUCK COUNT CANNOT SHARE IT — it spans every customer, which is a different scope, so
    // it is its own read below. Do not "tidy" the two into one.
    //
    // ⚠️ CAP ROWS ARE EXCLUDED FROM THE GREETING TOO. A customer-cap notice carries `response_sent`, so
    // it would otherwise become "the most recent reply" and suppress a later greeting. Today that is a
    // no-op (no cap rows exist); the exclusion is what keeps it a no-op once they do.
    let isFollowUp = false
    let capDecision: ReplyCapDecision = 'REPLY'
    // 🔴 THE MONTH'S COUNT, HOISTED SO THE SEND SITES BELOW CAN SEE IT. Null means the count read failed
    // (the fail-open branch) — and null must never be treated as zero, because zero would read as "this
    // truck has sent nothing" and could fire a 100%-used email at a truck on its first message of the
    // month, or suppress one that is genuinely due. No count, no allowance email.
    let monthCountBefore: number | null = null
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      // 🔴 THE 26-HOUR WINDOW IS GONE WITH THE DAILY CAP IT SERVED. It over-fetched by two hours so a
      // local-date filter in JS could pick out "today" across a DST change; there is no daily window to
      // filter for any more, and the monthly count is a database-side `count` over an exact boundary.
      // ── 🔴 THE LOCAL MONTH BOUNDARY, BUILT FROM THE PRIMITIVE THE DAY BOUNDARY ALREADY USES. ────
      // NO NEW TIMEZONE HELPER. `localDateOfInstant` is the only tz function touched here; the search
      // below converts "the 1st of the local month" into an INSTANT, which is what a count-only query
      // needs (it cannot filter in JS — that is the whole point of it being count-only).
      // ⚠️ A BINARY SEARCH, NOT A LOOP OVER MINUTES. ~13 `Intl` calls instead of ~2000. The band is
      // ±18h around UTC midnight of the 1st, which covers every real offset (max is ±14h).
      // ⚠️ "MONTH" HERE IS A CALENDAR MONTH AND **NOT** THE WABA BILLING CYCLE. Meta's cycle starts on
      // whatever day the account was created and is not exposed to us. This is a PROXY, deliberately —
      // it becomes per-truck and real when Embedded Signup ships and we own the account.
      //
      // 🔴 `truckTz` IS 'Europe/London', A BARE CONSTANT — AND `trucks.timezone` IS NULL ON ALL TWELVE
      // TRUCKS. The column exists and nothing populates it, so a `?? 'Europe/London'` would not be a
      // fallback: it is the ONLY BRANCH THAT EVER RUNS. **This is a UK-ONLY ASSUMPTION, not a defensive
      // default.**
      // ⚠️ AND THE MONTH BOUNDARY IS WHERE IT BITES HARDEST. A wrong timezone on the DAY boundary shifts
      // a cap by an hour. On the MONTH boundary it shifts A WHOLE BILLING PERIOD — silently, and in the
      // direction of a cap that RESETS EARLY, i.e. a ceiling that quietly stops being a ceiling. The
      // first non-UK truck is not an edge case here; it is a hole.
      // 🔴 ONE MONTH BOUNDARY, SHARED WITH THE SETTINGS USAGE LINE (lib/whatsapp/usage.ts). The binary
      // search that used to live here is that function's body now, so the number that stops replies and
      // the number the operator reads cannot be computed two different ways.
      const monthStart = monthStartIso(truckTz)

      const [mine, month] = await Promise.all([
        supabase.from('whatsapp_logs')
          .select('created_at, classification')
          .eq('customer_number', from)
          .eq('truck_id', truck.id)
          .not('response_sent', 'is', null)
          .gte('created_at', since24h)
          .order('created_at', { ascending: false }),
        // ── 🔴 COUNT-ONLY, AND CAP ROWS ARE NOW COUNTED. ────────────────────────────────────────────
        // `head: true` means the rows never leave Postgres — only the count comes back.
        // 🔴 THE `.or(...)` THAT EXCLUDED CAP CLASSIFICATIONS IS GONE, DELIBERATELY. The handoff is a
        // message Meta BILLS FOR, and excluding it meant the operator paid for messages their ceiling
        // could not see. Every row with `response_sent` set is a message we sent, and every message we
        // sent counts.
        supabase.from('whatsapp_logs')
          .select('*', { count: 'exact', head: true })
          .eq('truck_id', truck.id)
          .not('response_sent', 'is', null)
          .gte('created_at', monthStart),
      ])
      if (mine.error) throw mine.error
      if (month.error) throw month.error
      monthCountBefore = month.count ?? null

      // ⚠️ ONE PREDICATE, FROM THE MODULE. The route never lists the four names.
      const isCapRow = (c: string | null) => isCapClassification(c)
      const mineRows = mine.data ?? []
      const today = getLocalDateInTz(truckTz)

      // The greeting, unchanged in meaning: the most recent NON-CAP replied row, same local date.
      const priorReply = mineRows.find(r => !isCapRow(r.classification as string | null))
      isFollowUp = !!priorReply && localDateOfInstant(priorReply.created_at, truckTz) === today

      capDecision = decideReplyCap({
        customerReplies24h: mineRows.filter(r => !isCapRow(r.classification as string | null)).length,
        truckRepliesThisMonth: month.count ?? 0,
        // 🔴 THE TRUCK'S OWN CEILING. `?? DEFAULT` covers a row written before the column existed; the
        // column is NOT NULL DEFAULT 1000 so in practice it is always set.
        monthlyReplyLimit: truck.whatsapp_monthly_reply_limit ?? DEFAULT_MONTHLY_REPLY_LIMIT,
        customerCapNoticeSent: mineRows.some(r => r.classification === CLASSIFICATION_CUSTOMER_CAP),
        maxRepliesPerCustomer24h: DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H,
      })
    } catch (err) {
      // ── 🔴 FAIL OPEN. IF THE COUNT READ ERRORS, WE REPLY. ────────────────────────────────────────
      // 🔴 THIS IS THE OPPOSITE DIRECTION TO THE SIGNATURE GATE ABOVE, DELIBERATELY, BECAUSE THE COST
      // OF THE TWO FAILURES IS NOT THE SAME. A signature that cannot be verified may be a forged
      // request, so that gate refuses — the downside of being wrong is unbounded. A count that cannot
      // be read is a database blip, and the downside of being wrong here is a handful of messages at
      // fractions of a penny each. **Failing closed would mean a transient Supabase error silently
      // muting every truck's auto-replies**, which is a far worse outcome than a small overspend and,
      // unlike the overspend, would be invisible.
      // ⚠️ The greeting fails open in the same direction and for the same reason, unchanged.
      console.error(
        '[webhook/meta-whatsapp] cap/greeting read failed — FAILING OPEN, replying and greeting:', err)
      isFollowUp = false
      capDecision = 'REPLY'
    }

    // ── THE TWO CAP BRANCHES. BOTH RETURN 200. ──────────────────────────────────────────────────────
    // 🔴 EVERY PATH IN THIS ROUTE RETURNS 200, INCLUDING THESE. A non-200 lets Meta disable the
    // subscription — for EVERY truck, not just this one. A capped customer is not an error.
    // ── THE FOUR SILENT/NOTIFY BRANCHES. ALL RETURN 200. ────────────────────────────────────────────
    // 🔴 EVERY MESSAGE-HANDLING PATH RETURNS 200. A non-200 lets Meta disable the subscription — for
    // EVERY truck, not just this one. A capped customer is not an error.
    if (capDecision !== 'REPLY' && capDecision !== 'NOTIFY_CUSTOMER_CAP') {
      // ⚠️ ONE BRANCH, THREE REASONS, AND THE REASON IS RECORDED HONESTLY IN THE ROW. The three silent
      // members differ only in WHY nothing was sent, and that difference is the entire value of the log:
      // `whatsapp_logs` is what we will read to judge whether these limits are set right, so a row must
      // never claim a cap that did not fire.
      const silentClassification =
        capDecision === 'SILENT_TRUCK_MONTH_CAP' ? CLASSIFICATION_TRUCK_MONTH_CAP
        : CLASSIFICATION_CUSTOMER_NOTIFIED
      // Nothing is sent. `response_sent` is NULL, which is also what keeps this row out of every count.
      await supabase.from('whatsapp_logs').insert({
        truck_id: truck.id, customer_number: from, message_in: text,
        classification: silentClassification, events_found: 0,
        response_sent: null, possible_miss: false,
      })
      console.warn(
        `[webhook/meta-whatsapp] ${capDecision} for truck=${truck.id} — nothing sent. ` +
        `limits: customer/24h=${DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H} ` +
        `truck/month=${truck.whatsapp_monthly_reply_limit ?? DEFAULT_MONTHLY_REPLY_LIMIT}`)
      return NextResponse.json({ ok: true })
    }

    if (capDecision === 'NOTIFY_CUSTOMER_CAP') {
      // ⚠️ DETERMINISTIC AND NON-MODEL, ON PURPOSE. The whole point of the cap is to stop paying for
      // model calls and messages; generating this one through the classifier would defeat it.
      // 🔴 THE TEMPLATE LIVES IN THE PURE MODULE, WHICH IS WHERE THE CONTACT-CLAUSE RULE IS TESTED.
      // The route does not decide whether the number is usable — `handoffMessage` treats null, empty and
      // whitespace-only alike, and emits no clause at all when there is nothing to put in it.
      const hgUrlCap = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''
      const capMessage = handoffMessage(
        `${hgUrlCap}/trucks/${truck.slug}/order`, truck.whatsapp)
      // 🔴 `response_sent` NOW RECORDS WHAT META ACCEPTED, NOT WHAT WE COMPOSED. The send's failure was
      // caught and logged, and then the row was written claiming `response_sent: capMessage` anyway — so
      // a refused message counted against the truck's ceiling and, from this month, would be billed to
      // their allowance in our figures while Meta had charged them nothing. The message is still logged
      // either way; only the "we sent this" field now tells the truth.
      let handoffSent = false
      try {
        await sendMetaWhatsApp(from, capMessage, phoneNumberId, credential.accessToken)
        handoffSent = true
      } catch (sendErr) {
        console.error('[webhook/meta-whatsapp] handoff send failed:', sendErr)
        // 🔴 THE HANDOFF IS A BILLABLE SEND LIKE ANY OTHER, so a billing refusal here counts exactly as
        // it would on a normal reply. Leaving it out would mean a truck whose only remaining traffic is
        // capped customers never learns why nothing is arriving.
        await afterRefusedSend({ err: sendErr, truck, tz: truckTz })
      }
      if (handoffSent) await afterAcceptedSend({ truck, countBefore: monthCountBefore, tz: truckTz })
      await supabase.from('whatsapp_logs').insert({
        truck_id: truck.id, customer_number: from, message_in: text,
        classification: CLASSIFICATION_CUSTOMER_CAP, events_found: 0,
        response_sent: handoffSent ? capMessage : null, possible_miss: false,
      })
      console.warn(
        `[webhook/meta-whatsapp] CUSTOMER 24H CAP reached ` +
        `(${DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H}) for truck=${truck.id} — one handoff sent, then ` +
        `silence for the rest of the window. ⚠️ the handoff is itself billable.`)
      return NextResponse.json({ ok: true })
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

    // 🔴 THE SEND HAPPENS FIRST NOW, AND THE LOG RECORDS ITS OUTCOME. This block used to insert the row
    // BEFORE sending — fire-and-forget — so `response_sent` said "we replied" even when Meta then refused.
    // With the month's count now driving a spend ceiling the operator chose, a refused message must not
    // consume their allowance.
    // ⚠️ THE IGNORE BUCKET IS STILL LOGGED. `reply` null means the classifier chose silence: the row is
    // written with `response_sent: null`, exactly as before, because that is a real outcome worth keeping.
    // ⚠️ STILL FIRE-AND-FORGET — the insert is not awaited, so the 200 is not held behind it.
    let replySent = false
    if (reply) {
      try {
        await sendMetaWhatsApp(from, reply, phoneNumberId, credential.accessToken)
        replySent = true
        console.log('[webhook/meta-whatsapp] reply sent')
      } catch (err) {
        console.error('[webhook/meta-whatsapp] send failed:', err)
        await afterRefusedSend({ err, truck, tz: truckTz })
      }
    }
    if (replySent) await afterAcceptedSend({ truck, countBefore: monthCountBefore, tz: truckTz })

    // 🔴 AWAITED NOW, NOT FIRE-AND-FORGET. This row IS the monthly counter: the spend ceiling, the
    // Settings usage line and the 80%/100% emails are all a `count` over these rows. An un-awaited
    // insert can be cut off when the serverless invocation ends at the `return` below — so a message
    // Meta billed the operator for is never counted, and the ceiling they chose silently leaks.
    // ⚠️ IT STILL CANNOT FAIL THE REQUEST. The error is logged and the 200 is returned regardless; a
    // failed log must not become a Meta retry of a message we have already sent.
    const { error: logErr } = await supabase.from('whatsapp_logs').insert({
      truck_id:        truck.id,
      customer_number: from,
      message_in:      text,
      classification,
      events_found:    events?.length ?? 0,
      response_sent:   replySent ? reply : null,
      possible_miss:   classification === 'SPECIFIC_QUERY' && (events?.length ?? 0) === 0,
    })
    if (logErr) console.error('[webhook/meta-whatsapp] log failed:', logErr)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook/meta-whatsapp] error:', err)
    return NextResponse.json({ ok: true }) // always 200 — Meta retries on anything else
  }
}
