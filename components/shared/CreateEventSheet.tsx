'use client'
// components/shared/CreateEventSheet.tsx — 🔴 "CREATE EVENT NOW" (events-create-2, 17 November 2026;
// docs/events-create-1-report.md is the review, docs/events-create-2-report.md the build).
//
// Staff trading with no approved event make one on the spot, without Manage. The server action is
// app/api/dashboard/action/route.ts `create_event_now` (signed-in members only; the event is created approved, started
// and public, exactly as Manage makes events — lib/events/create-event.ts).
//
// THE FORM — the minimum is a name and the two times:
//   • "Where are you trading?" — up to six of the truck's places (favourites, then most recent), then "+ Somewhere else";
//   • "Event name" — ALWAYS shown, required, prefilled from the place, empty for "Somewhere else";
//   • "Starts" / "Ends" — ALWAYS shown, required: now rounded down to the quarter hour; the place's last end if later,
//     else start + 3 h;
//   • "Add town or postcode" — optional, collapsed;
//   • "Which van?" — only on a truck with more than one active van, then required.
// OVERLAP: the server answers 409 with the event it overlaps; the sheet asks (approved: "Already trading at {other}?";
// unapproved: "Approve {event} instead?") and only "Create anyway" / "Create new event" re-sends with confirm_overlap.
// LAYOUT: header fixed, the form scrolls, the buttons fixed. The sheet is sized to the VISUAL viewport (window.visualViewport)
// so "Create and start" stays above an on-screen keyboard on iPad and phone; without it, 100dvh.
import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/kitchenModals'
import '@/lib/i18n/catalog/errorsKitchen'
import { errorText } from '@/lib/i18n/customer-errors'
import { formatTime, getNowMinsInTz, timeSettingsOr, type TimeSettings } from '@/lib/time-utils'
import { clockMins } from '@/lib/event-window'

export type CreatePlace = { id: string; name: string; area: string | null; postcode: string | null; last_start: string | null; last_end: string | null; is_favourite?: boolean }
export type CreateVan = { id: string; name: string }
export type CreatedEvent = Record<string, unknown> & { id: string }
type Overlap = { kind: 'approved' | 'unapproved'; id: string; name: string; start: string | null; end: string | null }

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/** D7: now, rounded DOWN to the quarter hour, on the truck's clock. */
export function defaultStart(tz: string): string { return hm(Math.floor(getNowMinsInTz(tz) / 15) * 15) }
/** D8: the place's last end if later than the start, else start + 3 h (never past 23:59 — the event is today). */
export function defaultEnd(start: string, placeLastEnd: string | null | undefined): string {
  const s = clockMins(start) ?? 0
  const last = clockMins(placeLastEnd ?? null)
  if (last != null && last > s) return hm(last)
  return hm(Math.min(s + 180, 23 * 60 + 59))
}

/** The visible viewport's height and top (the part above an on-screen keyboard). Null before mount / without the API. */
function useVisualViewport(): { height: number; top: number } | null {
  const [vv, setVv] = useState<{ height: number; top: number } | null>(null)
  useEffect(() => {
    const v = typeof window !== 'undefined' ? window.visualViewport : null
    if (!v) return
    const read = () => setVv({ height: v.height, top: v.offsetTop })
    read()
    v.addEventListener('resize', read); v.addEventListener('scroll', read)
    return () => { v.removeEventListener('resize', read); v.removeEventListener('scroll', read) }
  }, [])
  return vv
}

export function CreateEventSheet({ open, time, places, vans, today, loading = false, isOffline = false, busyExternal = false, onSubmit, onClose, onUseExisting, onApproveExisting, initial }: {
  open: boolean
  time: TimeSettings | null | undefined
  /** The truck's places for the sheet (create_event_places): up to six, favourites then most recent. */
  places: CreatePlace[]
  vans: CreateVan[]
  /** The truck's today (YYYY-MM-DD), sent so the server can refuse a stale date. */
  today: string | null
  loading?: boolean
  isOffline?: boolean
  busyExternal?: boolean
  /** POST create_event_now. Resolves to the response status and body (the caller holds token / PIN / auth header). */
  onSubmit: (payload: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>
  onClose: () => void
  /** "Use {other}" — select the approved event instead. */
  onUseExisting: (eventId: string) => void
  /** "Approve {event}" — approve the unapproved event instead (the dashboard's approve path). */
  onApproveExisting: (eventId: string) => void
  /** Screenshots / tests only: start the form in a given state. */
  initial?: { placeId?: string | 'other' | null; showAddress?: boolean; overlap?: Overlap | null; errors?: Partial<Record<'name' | 'times' | 'end' | 'van', boolean>> }
}) {
  const t = useT('kitchenModals')
  const tErr = useT('errorsKitchen')
  const s = timeSettingsOr(time, 'create event')
  const vv = useVisualViewport()
  const [placeId, setPlaceId] = useState<string | 'other' | null>(initial?.placeId ?? null)
  const firstPlace = places.find(p => p.id === initial?.placeId) ?? null
  const [name, setName] = useState<string>(firstPlace?.name ?? '')
  const startDefault = useMemo(() => defaultStart(s.timeZone), [s.timeZone])
  const [start, setStart] = useState<string>(startDefault)
  const [end, setEnd] = useState<string>(defaultEnd(startDefault, firstPlace?.last_end))
  const [showAddress, setShowAddress] = useState<boolean>(!!initial?.showAddress)
  const [town, setTown] = useState<string>(firstPlace?.area ?? '')
  const [postcode, setPostcode] = useState<string>(firstPlace?.postcode ?? '')
  const [vanId, setVanId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Partial<Record<'name' | 'times' | 'end' | 'van', boolean>>>(initial?.errors ?? {})
  const [serverError, setServerError] = useState<string | null>(null)
  const [overlap, setOverlap] = useState<Overlap | null>(initial?.overlap ?? null)
  const [busy, setBusy] = useState(false)
  if (!open) return null

  const fieldError = (reason: 'name' | 'times' | 'end' | 'van') => errors[reason]
    ? <p className="text-xs font-semibold text-red-600 mt-1" data-field-error={reason}>{tErr('event_details_invalid', { reason })}</p> : null

  const pick = (p: CreatePlace | 'other') => {
    if (p === 'other') { setPlaceId('other'); setName(''); setTown(''); setPostcode(''); setEnd(defaultEnd(start, null)); return }
    setPlaceId(p.id); setName(p.name); setTown(p.area ?? ''); setPostcode(p.postcode ?? '')
    setEnd(defaultEnd(start, p.last_end))
    setErrors(e => ({ ...e, name: false }))
  }

  const submit = async (confirmOverlap = false) => {
    const e: Partial<Record<'name' | 'times' | 'end' | 'van', boolean>> = {}
    if (!name.trim()) e.name = true
    const sm = clockMins(start), em = clockMins(end)
    if (sm == null || em == null) e.times = true
    else if (em <= sm) e.end = true
    if (vans.length > 1 && !vanId) e.van = true
    setErrors(e); setServerError(null)
    if (Object.values(e).some(Boolean)) return
    setBusy(true)
    try {
      const res = await onSubmit({
        venue_name: name.trim(), start_time: start, end_time: end, ...(today ? { event_date: today } : {}),
        van_id: vans.length > 1 ? vanId : null, truck_place_id: placeId && placeId !== 'other' ? placeId : null,
        town: showAddress || placeId !== 'other' ? town.trim() || null : null, postcode: showAddress || placeId !== 'other' ? postcode.trim() || null : null,
        ...(confirmOverlap ? { confirm_overlap: true } : {}),
      })
      if (res.status === 409 && res.body.overlap) { setOverlap(res.body.overlap as Overlap); return }
      if (res.status === 400 && res.body.code === 'event_details_invalid') {
        const r = String(res.body.reason ?? '') as 'name' | 'times' | 'end' | 'van'
        if (r === 'name' || r === 'times' || r === 'end' || r === 'van') { setErrors({ [r]: true }); return }
      }
      if (res.status >= 400) setServerError(errorText(tErr, res.body, tErr('something_went_wrong')))
    } catch {
      setServerError(tErr('something_went_wrong'))
    } finally { setBusy(false) }
  }

  const disabled = busy || busyExternal || isOffline
  const range = (a: string | null, b: string | null) => `${formatTime(a ?? '', time)}–${formatTime(b ?? '', time)}`
  // Sized to what is visible: above the keyboard when one is open (iOS shrinks the VISUAL viewport, not the layout one).
  const shellStyle: React.CSSProperties = vv ? { top: vv.top, height: vv.height } : {}
  // SHORT SCREEN (under 480px visible — a phone with its keyboard open): the footer goes compact so the form keeps room.
  // iOS shrinks only the VISUAL viewport, which a height media query cannot see, so it is read from `vv` when there is
  // one; without it (first paint, older browsers) the same rule applies by media query.
  const compact = !!vv && vv.height < 480
  const compactCls = vv
    ? { show: compact ? '' : 'hidden', hide: compact ? 'hidden' : '', row: '', cancel: '' }
    : { show: 'hidden [@media(max-height:480px)]:block', hide: '[@media(max-height:480px)]:hidden', row: '[@media(max-height:480px)]:flex-row-reverse [@media(max-height:480px)]:gap-2', cancel: '[@media(max-height:480px)]:w-auto [@media(max-height:480px)]:mt-0 [@media(max-height:480px)]:px-3 [@media(max-height:480px)]:shrink-0' }
  const input = 'w-full border border-slate-300 rounded-xl px-3 py-2.5 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-300'

  return (
    <div className={`fixed left-0 right-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4 ${vv ? '' : 'top-0 bottom-0'}`} style={shellStyle}
      onClick={ev => ev.target === ev.currentTarget && !busy && onClose()} data-create-event-sheet>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-full" role="dialog" aria-modal="true"
        style={vv ? undefined : { maxHeight: 'calc(100dvh - 2rem)' }} onClick={ev => ev.stopPropagation()}>
        {/* header — fixed */}
        <div className={`flex items-center justify-between px-5 shrink-0 ${compact ? 'pt-3 pb-2' : `pt-5 pb-3 ${vv ? '' : '[@media(max-height:480px)]:pt-3 [@media(max-height:480px)]:pb-2'}`}`}>
          <h3 className="font-semibold text-slate-900">{t('createEvent.title')}</h3>
          <button onClick={onClose} disabled={busy} aria-label={t('close')} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
        </div>

        {/* the form — scrolls */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-3" data-create-form>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('createEvent.where')}</p>
          <div className="flex flex-col gap-1.5 mb-4">
            {loading && places.length === 0 && [0, 1, 2].map(i => <div key={i} className="h-11 rounded-xl bg-slate-100 animate-pulse" />)}
            {places.map(p => (
              <button key={p.id} type="button" onClick={() => pick(p)} data-place-row={p.id}
                className={`w-full text-left rounded-xl border px-3 py-2 ${placeId === p.id ? 'border-2 border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-200'}`}>
                <span className="block text-sm font-semibold text-slate-900 break-words">{p.is_favourite ? <span aria-hidden>★ </span> : null}{p.name}</span>
                {(p.area || (p.last_start && p.last_end)) && (
                  <span className="block text-xs text-slate-500 break-words">{[p.area, p.last_start && p.last_end ? range(p.last_start, p.last_end) : null].filter(Boolean).join(' · ')}</span>
                )}
              </button>
            ))}
            <button type="button" onClick={() => pick('other')} data-place-row="other"
              className={`w-full text-left rounded-xl border px-3 py-2 text-sm font-semibold ${placeId === 'other' ? 'border-2 border-orange-400 bg-orange-50 text-slate-900' : 'border-dashed border-slate-300 text-slate-600 hover:border-orange-200'}`}>
              <span aria-hidden>+ </span>{t('createEvent.somewhereElse')}
            </button>
          </div>

          <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="create-event-name">{t('createEvent.nameLabel')}</label>
          <input id="create-event-name" className={input} value={name} maxLength={120} autoComplete="off"
            onChange={ev => { setName(ev.target.value); if (errors.name) setErrors(e => ({ ...e, name: false })) }} />
          {fieldError('name')}

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="create-event-start">{t('createEvent.starts')}</label>
              <input id="create-event-start" type="time" step={300} className={input} value={start}
                onChange={ev => { setStart(ev.target.value); setErrors(e => ({ ...e, times: false, end: false })) }} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="create-event-end">{t('createEvent.ends')}</label>
              <input id="create-event-end" type="time" step={300} className={input} value={end}
                onChange={ev => { setEnd(ev.target.value); setErrors(e => ({ ...e, times: false, end: false })) }} />
            </div>
          </div>
          {fieldError('times')}{fieldError('end')}

          {vans.length > 1 && (
            <div className="mt-3">
              <p className="text-sm font-semibold text-slate-700 mb-1">{t('createEvent.van')}</p>
              <div className="flex flex-wrap gap-2">
                {vans.map(v => (
                  <button key={v.id} type="button" onClick={() => { setVanId(v.id); setErrors(e => ({ ...e, van: false })) }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold border ${vanId === v.id ? 'border-2 border-orange-400 bg-orange-50 text-slate-900' : 'border-slate-300 text-slate-700'}`}>{v.name}</button>
                ))}
              </div>
              {fieldError('van')}
            </div>
          )}

          <div className="mt-3">
            {!showAddress ? (
              <button type="button" onClick={() => setShowAddress(true)} className="text-sm font-semibold text-orange-600 hover:underline">
                <span aria-hidden>+ </span>{t('createEvent.addTown')}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="create-event-town">{t('createEvent.town')}</label>
                  <input id="create-event-town" className={input} value={town} maxLength={120} onChange={ev => setTown(ev.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="create-event-postcode">{t('createEvent.postcode')}</label>
                  <input id="create-event-postcode" className={input} value={postcode} maxLength={20} onChange={ev => setPostcode(ev.target.value)} />
                </div>
              </div>
            )}
          </div>
          {serverError && <p className="text-sm font-semibold text-red-600 mt-3" data-server-error>{serverError}</p>}
          {/* On a SHORT screen (a phone with the keyboard open) the note moves here, into the scroll, so the form keeps room. */}
          {!isOffline && <p className={`text-xs text-slate-500 mt-3 ${compactCls.show}`} data-create-note-in-form>{t('createEvent.note')}</p>}
        </div>

        {/* the buttons — fixed. Compact on a short screen: Cancel beside "Create and start", the note in the form above. */}
        <div className={`px-5 shrink-0 border-t border-slate-100 ${compact ? 'pt-2 pb-3' : 'pt-3 pb-5'}`} data-create-footer>
          <p className={`text-xs mb-2 ${isOffline ? 'text-amber-700 font-semibold' : `text-slate-500 ${compactCls.hide}`}`}>{isOffline ? t('createEvent.offline') : t('createEvent.note')}</p>
          <div className={compact ? 'flex gap-2 flex-row-reverse' : `flex flex-col ${compactCls.row}`}>
            <button onClick={() => submit(false)} disabled={disabled} data-create-submit
              className="w-full flex-1 bg-orange-600 text-white font-bold py-2.5 px-2 rounded-xl hover:bg-orange-700 text-sm disabled:opacity-50">{t('createEvent.create')}</button>
            <button onClick={onClose} disabled={busy} className={`text-sm text-slate-500 hover:text-slate-700 py-2 ${compact ? 'px-3 shrink-0' : `w-full mt-1 ${compactCls.cancel}`}`}>{t('cancel')}</button>
          </div>
        </div>
      </div>

      {/* the overlap question — over the sheet */}
      {overlap && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-4" onClick={ev => ev.target === ev.currentTarget && setOverlap(null)} data-create-overlap={overlap.kind}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl" role="dialog" aria-modal="true">
            {overlap.kind === 'approved' ? (<>
              <h3 className="font-black text-slate-900 mb-2 break-words">{t('createEvent.overlapApprovedTitle', { other: overlap.name })}</h3>
              <p className="text-sm text-slate-600 mb-4 break-words">{t('createEvent.overlapApprovedText', { other: overlap.name, start: formatTime(overlap.start ?? '', time), end: formatTime(overlap.end ?? '', time) })}</p>
              <div className="space-y-2">
                <button onClick={() => { const id = overlap.id; setOverlap(null); onUseExisting(id) }} className="w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm break-words">{t('createEvent.useOther', { other: overlap.name })}</button>
                <button onClick={() => { setOverlap(null); void submit(true) }} className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">{t('createEvent.createAnyway')}</button>
              </div>
            </>) : (<>
              <h3 className="font-black text-slate-900 mb-2 break-words">{t('createEvent.overlapUnapprovedTitle', { event: overlap.name })}</h3>
              <p className="text-sm text-slate-600 mb-4 break-words">{t('createEvent.overlapUnapprovedText', { event: overlap.name, start: formatTime(overlap.start ?? '', time), end: formatTime(overlap.end ?? '', time) })}</p>
              <div className="space-y-2">
                <button onClick={() => { const id = overlap.id; setOverlap(null); onApproveExisting(id) }} className="w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm break-words">{t('createEvent.approveOther', { event: overlap.name })}</button>
                <button onClick={() => { setOverlap(null); void submit(true) }} className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">{t('createEvent.createNew')}</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}
