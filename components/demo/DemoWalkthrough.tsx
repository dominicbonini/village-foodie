'use client'
// components/demo/DemoWalkthrough.tsx — demo-2 (30 October 2026, docs/demo-2-report.md): the guided demo.
//
// THE THREE STEPS (as the approved "Demo walkthrough mockup" describes them — the mockup is a Claude artifact, not a repo
// file, so this follows the brief's words):
//   1 · order like one of your customers — the REAL demo order page (/trucks/<slug>/order), unchanged but for its demo
//       touches (banner sentence, step label, no email, the payment panel);
//   2 · it arrives in your kitchen — the visitor's own order on a kitchen screen, with "Start cooking";
//   3 · mark it ready — "Ready", then "Alex has just been told", and "Start free, keep my menu".
// ON A PHONE (< 1024px) the steps are pages: /try/<slug> sends the visitor to the order page; ordering brings them back
// to /try/<slug>?view=kitchen, the kitchen screen with a speech bubble above their order, then a bottom sheet.
// ON A LAPTOP (≥ 1024px) it is one page: the order page in a phone frame on the left, the kitchen screen on the right,
// a three-step bar across the top, and a closing band.
//
// 🔴 A DEMO-ONLY SCOPED VIEW. No dashboard token anywhere: it talks to /api/demo/walkthrough by SLUG, and the kitchen
// shows only the orders THIS browser placed (lib/demo-board-build), which the API re-checks belong to the demo truck.
// The two buttons move only those orders, forward, and send nothing. Every step is counted server-side.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { DemoGetStarted } from '@/components/DemoGetStarted'
import { useT, useTruckLocale } from '@/lib/i18n/use-t'
import { formatTime, type TimeSettings } from '@/lib/time-utils'
import { demoWalkOrders, addDemoWalkOrder, clearDemoWalkOrders, demoEmailFor } from '@/lib/demo-board-build'
import '@/lib/i18n/catalog/demoWalk'
import '@/lib/i18n/catalog/demo'

export const WIDE_QUERY = '(min-width: 1024px)'
const POLL_MS = 3000

export interface WalkOrder {
  orderKey: string; number: string; name: string; slot: string | null; status: string
  items: { name: string; quantity: number }[]; deals: { name: string }[]; createdAt: string | null
}
interface OpenInfo { source: 'landing' | 'outreach'; trialMonths: number | null; time: TimeSettings | null; truckName: string; extractionSource: string | null }
type Phase = 'loading' | 'ready' | 'gone' | 'error'

const subscribeWide = (fn: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia(WIDE_QUERY)
  mq.addEventListener('change', fn)
  return () => mq.removeEventListener('change', fn)
}
const readWide = () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(WIDE_QUERY).matches)

/** What the kitchen is waiting for next, for the newest order (or none). */
export function walkStep(order: WalkOrder | null): 1 | 2 | 3 | 4 {
  if (!order) return 1
  if (order.status === 'ready' || order.status === 'collected') return 4
  if (order.status === 'cooking') return 3
  return 2
}

export function DemoWalkthrough({ slug }: { slug: string }) {
  const t = useT('demoWalk')
  const tDemo = useT('demo')
  const wide = useSyncExternalStore(subscribeWide, readWide, () => false)
  const [view, setView] = useState<'order' | 'kitchen'>('order')
  const [phase, setPhase] = useState<Phase>('loading')
  const [info, setInfo] = useState<OpenInfo | null>(null)
  const [orders, setOrders] = useState<WalkOrder[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState(false)
  const [frameKey, setFrameKey] = useState(0)
  const [seenReady, setSeenReady] = useState<string | null>(null)   // laptop: the ready order whose phone overlay was dismissed
  const opened = useRef(false)
  useTruckLocale(info?.time?.locale ?? null)

  // `?view=kitchen` — read after mount (no Suspense boundary for one optional string, as app/admin does).
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view')
    if (v === 'kitchen') setView('kitchen')
  }, [])

  const post = useCallback((body: Record<string, unknown>) => fetch('/api/demo/walkthrough', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, ...body }),
  }), [slug])

  // ── open: a live service, the visit counted, the page's facts. A POST after load — never a GET side effect. ──
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    void (async () => {
      try {
        const res = await post({ action: 'open' })
        if (res.status === 410 || res.status === 404) { setPhase('gone'); return }
        const data = await res.json()
        if (!res.ok || !data?.ok) { setPhase('error'); return }
        if (data.restarted) clearDemoWalkOrders(slug)   // the restart wiped the old orders on the server
        setInfo({ source: data.source, trialMonths: data.trialMonths ?? null, time: data.time ?? null, truckName: data.truckName ?? '', extractionSource: data.extractionSource ?? null })
        setPhase('ready')
      } catch { setPhase('error') }
    })()
  }, [post, slug])

  // A phone that is not on the kitchen step goes to the real order page (step 1).
  useEffect(() => {
    if (phase === 'ready' && !wide && view === 'order') window.location.replace(`/trucks/${encodeURIComponent(slug)}/order`)
  }, [phase, wide, view, slug])

  // ── the visitor's orders: on load, on the order page's message (laptop), and every few seconds ──
  const refresh = useCallback(async () => {
    const keys = demoWalkOrders(slug)
    if (!keys.length) { setOrders([]); return }
    try {
      const res = await fetch(`/api/demo/walkthrough?slug=${encodeURIComponent(slug)}&orders=${keys.map(encodeURIComponent).join(',')}`, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok && data?.ok && Array.isArray(data.orders)) setOrders(data.orders)
    } catch { /* the next tick tries again */ }
  }, [slug])
  useEffect(() => {
    if (phase !== 'ready') return
    void refresh()
    const id = setInterval(() => { void refresh() }, POLL_MS)
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data as { type?: string; orderKey?: string } | null
      if (d?.type === 'hg-demo-order' && typeof d.orderKey === 'string') { addDemoWalkOrder(slug, d.orderKey); void refresh() }
    }
    window.addEventListener('message', onMsg)
    return () => { clearInterval(id); window.removeEventListener('message', onMsg) }
  }, [phase, refresh, slug])

  const latest = orders.length ? orders[orders.length - 1] : null
  const step = walkStep(latest)

  const act = async (order: WalkOrder, action: 'start_cooking' | 'ready') => {
    setBusy(order.orderKey); setActionError(false)
    try {
      const res = await post({ action, orderKey: order.orderKey })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) { setActionError(true); return }
      setOrders(list => list.map(o => (o.orderKey === order.orderKey ? { ...o, status: data.status } : o)))
    } catch { setActionError(true) } finally { setBusy(null) }
  }

  const months = info?.trialMonths ?? 0
  const startFree = (variant: 'sheet' | 'band') => (
    <DemoGetStarted
      slug={slug}
      prefillEmail={demoEmailFor(slug)}
      extractionSource={info?.extractionSource ?? null}
      setupLabel={variant === 'sheet' ? t('startFree', { months }) : t('bandStart')}
      onOpen={() => { void post({ action: 'event', event: 'signup_started' }).catch(() => undefined) }}
      className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-white font-black px-6 py-3 rounded-xl text-base shadow-sm"
    />
  )
  const name = latest?.name || t('defaultName')

  if (phase === 'loading' || (phase === 'ready' && !wide && view === 'order')) {
    return <Centered><p className="text-slate-500 font-bold animate-pulse">{t('loading')}</p></Centered>
  }
  if (phase === 'gone') {
    return (
      <Centered>
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-black text-slate-900">{t('goneTitle')}</h1>
          <p className="text-slate-600 text-sm mt-2">{t('goneBody')}</p>
          <a href="/" className="inline-block mt-5 bg-orange-600 hover:bg-orange-700 text-white font-black px-6 py-3 rounded-xl">{t('goneButton')}</a>
        </div>
      </Centered>
    )
  }
  if (phase === 'error' || !info) {
    return <Centered><p className="text-slate-700 font-bold">{t('failed')}</p></Centered>
  }

  const card = (o: WalkOrder, size: 'phone' | 'panel') => (
    <KitchenCard key={o.orderKey} order={o} time={info.time} size={size} busy={busy === o.orderKey}
      onStart={() => act(o, 'start_cooking')} onReady={() => act(o, 'ready')} />
  )

  // ── LAPTOP: one page, phone on the left, kitchen on the right ──────────────────────────────────────
  if (wide) {
    const showPhoneReady = !!latest && step === 4 && seenReady !== latest.orderKey
    return (
      <div className="min-h-dvh bg-slate-100 flex flex-col" data-walkthrough="wide">
        <DemoModeBanner message={tDemo('walkBanner')} />
        <StepBar step={step} labels={[t('barOrder'), t('barArrives'), t('barReady')]} />
        <div className="flex-1 w-full max-w-6xl mx-auto px-6 py-6 grid grid-cols-[400px_1fr] gap-8 items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">{t('phoneLabel')}</p>
            <div className="relative w-[390px] h-[760px] rounded-[2.5rem] border-[10px] border-slate-900 bg-white shadow-2xl overflow-hidden" data-phone-frame>
              <iframe key={frameKey} title={t('phoneLabel')} src={`/trucks/${encodeURIComponent(slug)}/order`} className="w-full h-full border-0" />
              {showPhoneReady && (
                <div className="absolute inset-0 bg-white flex flex-col items-center justify-center text-center px-6" data-phone-ready>
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mb-4" aria-hidden>✓</div>
                  <p className="text-xl font-black text-slate-900">{t('phoneReadyTitle')}</p>
                  <p className="text-slate-600 mt-1">{t('phoneReadyBody')}</p>
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">{t('kitchenLabel')}</p>
            <div className="rounded-2xl bg-slate-900 p-5 min-h-[360px]" data-kitchen>
              {orders.length === 0 ? (
                <div className="h-[320px] flex flex-col items-center justify-center text-center px-6" data-kitchen-empty>
                  <p className="text-white text-lg font-black">{t('waitingTitle')}</p>
                  <p className="text-slate-400 text-sm mt-2 max-w-sm">{t('waitingBody')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{orders.slice().reverse().map(o => card(o, 'panel'))}</div>
              )}
              {actionError && <p className="text-red-300 text-sm mt-3">{t('failed')}</p>}
            </div>
          </div>
        </div>
        {step === 4 && (
          <div className="sticky bottom-0 z-10 bg-white border-t border-slate-200 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]" data-walk-band>
            <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between gap-6">
              <p className="text-xl font-black text-slate-900">{t('bandTitle')}</p>
              <div className="flex items-center gap-4 shrink-0">
                {startFree('band')}
                <button type="button" onClick={() => { if (latest) setSeenReady(latest.orderKey); setFrameKey(k => k + 1) }}
                  className="text-slate-700 font-bold underline underline-offset-2">{t('orderAgain')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── PHONE: the kitchen screen, a speech bubble above the order, then the bottom sheet ──────────────
  return (
    <div className="min-h-dvh bg-slate-900 flex flex-col" data-walkthrough="phone">
      <DemoModeBanner />
      <div className="flex-1 px-4 py-5 pb-72">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400 mb-3">{t('kitchenLabel')}</p>
        {!latest ? (
          <div className="rounded-2xl border border-slate-700 px-5 py-10 text-center" data-kitchen-empty>
            <p className="text-white font-black">{t('waitingTitle')}</p>
            <p className="text-slate-400 text-sm mt-2">{t('waitingBody')}</p>
            <a href={`/trucks/${encodeURIComponent(slug)}/order`} className="inline-block mt-4 text-orange-400 font-bold underline">{t('backToMenu')}</a>
          </div>
        ) : (
          <>
            {step < 4 && (
              <SpeechBubble label={t('step2')} title={step === 2 ? t('bubbleTitle') : null} body={step === 2 ? t('bubbleArrived') : t('bubbleReady')} />
            )}
            {card(latest, 'phone')}
            {actionError && <p className="text-red-300 text-sm mt-3">{t('failed')}</p>}
          </>
        )}
      </div>
      {step === 4 && latest && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.25)] px-5 pt-5"
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }} data-walk-sheet role="dialog" aria-label={t('step3')}>
          <p className="text-xs font-black uppercase tracking-wide text-orange-600">{t('step3')}</p>
          <p className="text-lg font-black text-slate-900 mt-1">{t('told', { name })}</p>
          <p className="text-sm text-slate-600 mt-2">{t('thatsIt')}</p>
          <div className="mt-4">{startFree('sheet')}</div>
          <a href={`/trucks/${encodeURIComponent(slug)}/order`} className="block text-center mt-3 text-slate-700 font-bold underline underline-offset-2">{t('tryAnother')}</a>
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-slate-50 flex items-center justify-center px-4">{children}</div>
}

function StepBar({ step, labels }: { step: 1 | 2 | 3 | 4; labels: [string, string, string] }) {
  return (
    <ol className="w-full bg-white border-b border-slate-200" data-step-bar>
      <div className="max-w-6xl mx-auto px-6 py-3 grid grid-cols-3 gap-3">
        {labels.map((label, i) => {
          const n = i + 1
          const state = step > n ? 'done' : step === n ? 'current' : 'next'
          return (
            <li key={label} data-state={state} className={`flex items-center gap-2 text-sm font-bold ${state === 'next' ? 'text-slate-400' : 'text-slate-900'}`}>
              <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-black ${state === 'done' ? 'bg-green-600 text-white' : state === 'current' ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {state === 'done' ? '✓' : n}
              </span>
              <span className="truncate">{label}</span>
            </li>
          )
        })}
      </div>
    </ol>
  )
}

function SpeechBubble({ label, title, body }: { label: string; title: string | null; body: string }) {
  return (
    <div className="relative bg-white rounded-2xl px-4 py-3 mb-5 shadow-lg" data-speech-bubble>
      <p className="text-[11px] font-black uppercase tracking-wide text-orange-600">{label}</p>
      {title && <p className="text-base font-black text-slate-900 mt-0.5">{title}</p>}
      <p className="text-sm text-slate-700 mt-1">{body}</p>
      <span className="absolute left-8 -bottom-2 w-4 h-4 bg-white rotate-45" aria-hidden />
    </div>
  )
}

export function KitchenCard({ order, time, size, busy, onStart, onReady }: {
  order: WalkOrder; time: TimeSettings | null; size: 'phone' | 'panel'; busy: boolean; onStart: () => void; onReady: () => void
}) {
  const t = useT('demoWalk')
  const at = order.slot ? formatTime(order.slot, time) : null   // "18:30", never "18:30:00"
  const status = order.status
  const ready = status === 'ready' || status === 'collected'
  const cooking = status === 'cooking'
  return (
    <div data-kitchen-card={status} className={`rounded-2xl bg-white overflow-hidden ${ready ? 'ring-4 ring-green-500' : cooking ? 'ring-4 ring-amber-400' : 'ring-4 ring-orange-500'}`}>
      <div className={`px-4 py-2 flex items-center justify-between ${ready ? 'bg-green-600' : cooking ? 'bg-amber-500' : 'bg-orange-600'} text-white`}>
        <span className="font-black">{t('orderNumber', { number: order.number })}</span>
        <span className="text-xs font-black uppercase tracking-wide">{ready ? t('readyBadge') : cooking ? t('cooking') : t('newBadge')}</span>
      </div>
      <div className="px-4 py-3">
        <p className="text-lg font-black text-slate-900">{order.name}</p>
        <p className="text-sm font-bold text-slate-600">{at ? t('collectAt', { time: at }) : t('collectAsap')}</p>
        <ul className="mt-3 space-y-1">
          {order.items.map((i, k) => (
            <li key={k} className="text-base text-slate-900"><span className="font-black">{i.quantity}×</span> {i.name}</li>
          ))}
          {order.deals.map((d, k) => <li key={`d${k}`} className="text-base text-slate-900"><span className="font-black">1×</span> {d.name}</li>)}
        </ul>
      </div>
      {!ready && (
        <div className="px-4 pb-4">
          <button type="button" disabled={busy} onClick={cooking ? onReady : onStart} data-kitchen-action={cooking ? 'ready' : 'start'}
            className={`w-full font-black rounded-xl text-white disabled:opacity-50 ${size === 'phone' ? 'py-4 text-lg' : 'py-3 text-base'} ${cooking ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
            {cooking ? (size === 'phone' ? t('ready') : t('readyForCollection')) : t('startCooking')}
          </button>
        </div>
      )}
    </div>
  )
}
