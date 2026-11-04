'use client'
// components/manage/PaperworkTab.tsx — Manage › Paperwork (paperwork-1, 4 November 2026; the approved layout is
// docs/paperwork-1/paperwork-mockup.png). Phone first; iPad and laptop sit in Manage's wider column like every other tab.
//
// The list (the country's default types, then any custom documents) · counts · checkboxes and the "Send to organiser" bar ·
// VIEW (the file, its details, earlier versions, Delete) · UPLOAD (camera, photo or file → the AI reads it → "Check the details"
// → Save) · SEND (a link for organisers) · SENT (each link: who, when, opened, views, until, Turn off).
// 🔴 NOTHING IS SAVED FROM THE AI ALONE: the draft is only a pre-filled form; Save is the truck's.
// 🔴 THE FILE NEVER PASSES THROUGH OUR FUNCTIONS ON THE WAY IN: it is PUT to a signed storage URL (20 MB files are past a
// function's request limit); the server then checks its BYTES, converts HEIC, and reads it.
// Words: `paperwork` (every language). Dates: the truck's (useTruckTime). Amounts: the money formatter.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT } from '@/lib/i18n/use-t'
import { useTruckTime } from '@/components/TruckTimeContext'
import { useCountrySettings } from '@/components/CountrySettingsProvider'
import { moneyFormatOf } from '@/lib/country-settings-types'
import { formatWholeAmount, toMajor, toMinorUnits } from '@/lib/money-format'
import { formatYmdShortMonth, type TimeSettings } from '@/lib/time-utils'
import { nativeAuthHeader } from '@/lib/native/session'
import {
  ACCEPT_ATTRIBUTE, MAX_FILE_BYTES, MAX_ORGANISER_EMAILS, SHARE_MAX_DAYS, addDays, defaultShareUntil, documentStatus, draftWarnings,
  parseOrganiserEmails, shareState, type DocStatus, type DocumentType, type DraftDetails, type DraftWarning,
} from '@/lib/paperwork/model'
import '@/lib/i18n/catalog/paperwork'

type T = ReturnType<typeof useT<'paperwork'>>
interface Doc { id: string; typeKey: string | null; customName: string | null; issuer: string | null; issuedOn: string | null; expiresOn: string | null; nameOnDocument: string | null; coverAmountMinor: number | null; currency: string | null; mime: string | null; status: 'current' | 'superseded'; supersededBy: string | null; createdAt: string }
interface Share { id: string; emails: string[]; createdAt: string; expiresAt: string; revokedAt: string | null; firstOpenedAt: string | null; viewCount: number; eventId: string | null; items: { typeKey: string | null; documentId: string | null }[] }
interface Loaded { today: string; types: DocumentType[]; currency: string | null; truckNames: string[]; documents: Doc[]; events: { id: string; date: string; name: string }[]; shares: Share[] }
type Sheet = null | { kind: 'upload'; typeKey: string | null; replaces: string | null } | { kind: 'view'; docId: string } | { kind: 'send' }
/** A row's key: a type (`t:<key>`) or a custom document (`d:<id>`) — what a share names. */
type RowKey = string

async function call(token: string, action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch('/api/manage/paperwork', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
    body: JSON.stringify({ token, action, ...extra }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : res.statusText)
  return data
}
const shortDate = (ymd: string, ts: TimeSettings) => formatYmdShortMonth(ymd, ts, { day: 'numeric', month: 'short', year: 'numeric' })
const instantYmd = (iso: string, ts: TimeSettings) => new Intl.DateTimeFormat('en-CA', { timeZone: ts.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

// ── small pieces ──────────────────────────────────────────────────────────────────────────────────────────────────────
const PILL: Record<DocStatus, string> = {
  up_to_date: 'bg-green-50 text-green-700 border-green-200',
  due_soon: 'bg-amber-50 text-amber-700 border-amber-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
  missing: 'bg-slate-100 text-slate-600 border-slate-200',
}
function StatusPill({ status, t }: { status: DocStatus; t: T }) {
  const word = status === 'up_to_date' ? t('status.upToDate') : status === 'due_soon' ? t('status.dueSoon') : status === 'expired' ? t('status.expired') : t('status.upload')
  return <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${PILL[status]}`}>{word}</span>
}

/** A dialog: a bottom sheet on a phone, a centred card on a wider screen. Escape and the backdrop close it. */
function SheetFrame({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const t = useT('paperwork')
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('input,select,textarea,button,a[href]')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={id}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-slate-50 p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={id} className="text-2xl font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('view.close')} className="rounded-lg px-2 text-2xl leading-none text-slate-500 hover:bg-slate-200">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
const LABEL = 'mb-1.5 block text-sm font-bold text-slate-800'
const INPUT = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200'
const PRIMARY = 'w-full rounded-xl bg-orange-500 px-5 py-3.5 text-base font-bold text-white hover:bg-orange-600 disabled:opacity-50'
/** A dropdown that looks like the fields around it (WebKit draws a native select otherwise), with its chevron. */
const SELECT = `${INPUT} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath d='M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z'/%3E%3C/svg%3E")] bg-[length:1.25rem] bg-[right_0.9rem_center] bg-no-repeat pr-11`
const SECONDARY = 'rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50'

function WarningBox({ warnings, t, ts }: { warnings: DraftWarning[]; t: T; ts: TimeSettings }) {
  if (!warnings.length) return null
  return (
    <div role="status" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-warnings={warnings.map(w => w.code).join(' ')}>
      {warnings.map(w => (
        <p key={w.code}>⚠️ {w.code === 'notRead' ? t('warnings.notRead') : w.code === 'expired' ? t('warnings.expired', { date: shortDate(w.params.date, ts) })
          : w.code === 'expiresSoon' ? t('warnings.expiresSoon', { days: w.params.days }) : t('warnings.nameMismatch', { name: w.params.name })}</p>
      ))}
    </div>
  )
}

// ── "Check the details" (also the View sheet's Edit) ──────────────────────────────────────────────────────────────────
interface FormState { typeSel: string; customName: string; issuer: string; issuedOn: string; expiresOn: string; nameOnDocument: string; cover: string; currency: string }
const OTHER = '__other'
function formOf(d: DraftDetails, fallbackCurrency: string | null): FormState {
  return {
    typeSel: d.typeKey ?? (d.customName ? OTHER : ''), customName: d.customName ?? '', issuer: d.issuer ?? '', issuedOn: d.issuedOn ?? '', expiresOn: d.expiresOn ?? '',
    nameOnDocument: d.nameOnDocument ?? '', cover: d.coverAmountMinor && d.currency ? String(toMajor(d.coverAmountMinor, d.currency)) : '', currency: d.currency ?? fallbackCurrency ?? 'GBP',
  }
}
function detailsOf(f: FormState, types: DocumentType[]): DraftDetails | 'needType' | 'badDates' {
  const typeKey = f.typeSel && f.typeSel !== OTHER ? f.typeSel : null
  if (!typeKey && !f.customName.trim()) return 'needType'
  const hasExpiry = typeKey ? types.find(x => x.key === typeKey)?.hasExpiry !== false : true
  const expiresOn = hasExpiry && f.expiresOn ? f.expiresOn : null
  if (f.issuedOn && expiresOn && expiresOn < f.issuedOn) return 'badDates'
  const coverNum = Number(f.cover.replace(/[\s,]/g, ''))
  const cover = f.cover.trim() && Number.isFinite(coverNum) && coverNum > 0 ? toMinorUnits(coverNum, f.currency) : null
  return { typeKey, customName: typeKey ? null : f.customName.trim(), issuer: f.issuer.trim() || null, issuedOn: f.issuedOn || null, expiresOn,
    nameOnDocument: f.nameOnDocument.trim() || null, coverAmountMinor: cover, currency: cover ? f.currency : null }
}
const COVER_TYPES = new Set(['public_liability', 'employers_liability'])

function DetailsForm({ initial, read, aiBanner, data, t, ts, saveLabel, onSave, onCancel }: {
  initial: DraftDetails; read: boolean; aiBanner: boolean; data: Loaded; t: T; ts: TimeSettings; saveLabel: string
  onSave: (d: DraftDetails) => Promise<void>; onCancel: () => void
}) {
  const [f, setF] = useState<FormState>(() => formOf(initial, data.currency))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = { type: useId(), name: useId(), issuer: useId(), issued: useId(), expires: useId(), onDoc: useId(), cover: useId(), currency: useId() }
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }))
  const type = data.types.find(x => x.key === f.typeSel)
  const hasExpiry = type ? type.hasExpiry : true
  const warnings = draftWarnings({ expiresOn: hasExpiry ? f.expiresOn || null : null, nameOnDocument: f.nameOnDocument || null }, data.today, data.truckNames, read)
  const showCover = COVER_TYPES.has(f.typeSel) || f.typeSel === OTHER || !!f.cover
  const save = async () => {
    const d = detailsOf(f, data.types)
    if (d === 'needType') { setError(t('check.needType')); return }
    if (d === 'badDates') { setError(t('check.badDates')); return }
    setBusy(true); setError(null)
    try { await onSave(d) } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }
  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); save() }} data-form="details">
      {aiBanner && read && <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">✨ {t('check.aiBanner')}</p>}
      <div>
        <label htmlFor={ids.type} className={LABEL}>{t('check.document')}</label>
        <select id={ids.type} className={SELECT} value={f.typeSel} onChange={set('typeSel')}>
          <option value="" disabled>—</option>
          {data.types.map(x => <option key={x.key} value={x.key}>{t(`types.${x.key}` as never)}</option>)}
          <option value={OTHER}>{t('check.other')}</option>
        </select>
      </div>
      {f.typeSel === OTHER && (
        <div><label htmlFor={ids.name} className={LABEL}>{t('check.otherName')}</label>
          <input id={ids.name} className={INPUT} value={f.customName} onChange={set('customName')} maxLength={120} /></div>
      )}
      <div><label htmlFor={ids.issuer} className={LABEL}>{t('check.issuer')}</label>
        <input id={ids.issuer} className={INPUT} value={f.issuer} onChange={set('issuer')} maxLength={160} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor={ids.issued} className={LABEL}>{t('check.issued')}</label>
          <input id={ids.issued} type="date" className={INPUT} value={f.issuedOn} onChange={set('issuedOn')} /></div>
        {hasExpiry && (
          <div><label htmlFor={ids.expires} className={LABEL}>{type?.dateLabel === 'review_by' ? t('check.reviewBy') : t('check.expires')}</label>
            <input id={ids.expires} type="date" className={INPUT} value={f.expiresOn} onChange={set('expiresOn')} /></div>
        )}
      </div>
      <div><label htmlFor={ids.onDoc} className={LABEL}>{t('check.nameOnDocument')}</label>
        <input id={ids.onDoc} className={INPUT} value={f.nameOnDocument} onChange={set('nameOnDocument')} maxLength={160} /></div>
      {showCover && (
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div><label htmlFor={ids.cover} className={LABEL}>{t('check.cover')}</label>
            <input id={ids.cover} inputMode="decimal" className={INPUT} value={f.cover} onChange={set('cover')} aria-describedby={`${ids.cover}-h`} />
            <p id={`${ids.cover}-h`} className="mt-1 text-xs text-slate-500">{t('check.coverHint')}</p></div>
          <div><label htmlFor={ids.currency} className={LABEL}>{t('check.currency')}</label>
            <input id={ids.currency} className={INPUT} value={f.currency} maxLength={3} onChange={e => setF(p => ({ ...p, currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))} /></div>
        </div>
      )}
      <WarningBox warnings={warnings} t={t} ts={ts} />
      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      <button type="submit" className={PRIMARY} disabled={busy}>{busy ? t('check.saving') : saveLabel}</button>
      <button type="button" onClick={onCancel} className="w-full py-2 text-sm font-semibold text-slate-600">{t('check.cancel')}</button>
      <p className="text-sm text-slate-500">{t('check.footer')}</p>
    </form>
  )
}

// ── upload → read → check ─────────────────────────────────────────────────────────────────────────────────────────────
const contentTypeOf = (file: File) => file.type || (/\.(heic|heif)$/i.test(file.name) ? 'image/heic' : /\.pdf$/i.test(file.name) ? 'application/pdf' : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : 'image/jpeg')
const ACCEPTED_BY_NAME = /\.(pdf|jpe?g|png|heic|heif|webp)$/i

function UploadSheet({ token, data, typeKey, replaces, t, ts, onDone, onClose }: {
  token: string; data: Loaded; typeKey: string | null; replaces: string | null; t: T; ts: TimeSettings; onDone: () => void; onClose: () => void
}) {
  const camera = useRef<HTMLInputElement>(null), picker = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<'choose' | 'uploading' | 'reading' | 'check'>('choose')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ documentId: string; read: boolean; details: DraftDetails } | null>(null)
  const pending = useRef<string | null>(null)

  const close = useCallback(() => {
    if (pending.current) call(token, 'cancel_upload', { documentId: pending.current }).catch(() => {})
    onClose()
  }, [token, onClose])

  const start = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > MAX_FILE_BYTES) { setError(t('upload.tooBig')); return }
    if (file.type && !/^(application\/pdf|image\/(jpeg|png|heic|heif|webp))$/.test(file.type) && !ACCEPTED_BY_NAME.test(file.name)) { setError(t('upload.wrongType')); return }
    const contentType = contentTypeOf(file)
    try {
      setPhase('uploading'); setPercent(0)
      const { documentId, uploadUrl } = await call(token, 'upload_url', { filename: file.name, contentType, size: file.size })
      pending.current = documentId
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', contentType)
        xhr.upload.onprogress = e => { if (e.lengthComputable) setPercent(Math.round((e.loaded / e.total) * 100)) }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(t('upload.failed'))))
        xhr.onerror = () => reject(new Error(t('upload.failed')))
        xhr.send(file)
      })
      setPhase('reading')
      const r = await call(token, 'read', { documentId })
      const details: DraftDetails = { ...r.draft, ...(typeKey && !r.draft.typeKey ? { typeKey, customName: null } : {}) }
      setDraft({ documentId, read: !!r.read, details })
      setPhase('check')
    } catch (e) {
      pending.current = null
      setError(e instanceof Error ? e.message : t('upload.failed')); setPhase('choose')
    }
  }

  if (phase === 'check' && draft) {
    return (
      <SheetFrame title={t('check.title')} onClose={close}>
        <DetailsForm initial={draft.details} read={draft.read} aiBanner data={data} t={t} ts={ts} saveLabel={t('check.save')} onCancel={close}
          onSave={async d => { await call(token, 'save', { documentId: draft.documentId, details: d, replaces }); pending.current = null; onDone() }} />
      </SheetFrame>
    )
  }
  return (
    <SheetFrame title={t('upload.title')} onClose={close}>
      {phase === 'choose' ? (
        <div className="space-y-3">
          <p className="text-slate-600">{t('upload.intro')}</p>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => start(e.target.files?.[0])} />
          <input ref={picker} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => start(e.target.files?.[0])} />
          <button type="button" className={PRIMARY} onClick={() => camera.current?.click()}>📷 {t('upload.takePhoto')}</button>
          <button type="button" className={`${SECONDARY} w-full py-3.5 text-base`} onClick={() => picker.current?.click()}>📄 {t('upload.chooseFile')}</button>
          <p className="text-xs text-slate-500">{t('upload.accepted')}</p>
          {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3 py-6 text-center">
          {phase === 'uploading' ? (
            <>
              <p className="font-semibold text-slate-800">{t('upload.uploading', { percent })}</p>
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-orange-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
            </>
          ) : <p className="font-semibold text-slate-800" role="status">✨ {t('upload.reading')}</p>}
        </div>
      )}
    </SheetFrame>
  )
}

// ── view ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
function ViewSheet({ token, data, doc, name, t, ts, onChanged, onRenew, onClose }: {
  token: string; data: Loaded; doc: Doc; name: string; t: T; ts: TimeSettings; onChanged: (msg: string) => void; onRenew: () => void; onClose: () => void
}) {
  const [urls, setUrls] = useState<{ open: string; download: string } | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchUrls = useCallback(async (id: string) => {
    try {
      const [a, b] = await Promise.all([call(token, 'file_url', { documentId: id }), call(token, 'file_url', { documentId: id, download: true })])
      setUrls({ open: a.url, download: b.url }); setUrlError(null)
    } catch (e) { setUrlError(e instanceof Error ? e.message : String(e)) }
  }, [token])
  // Signed links last 5 minutes: fetched when the sheet opens, and again every 4 while it stays open.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the file's links from the server when the sheet opens
  useEffect(() => { fetchUrls(doc.id); const i = setInterval(() => fetchUrls(doc.id), 240_000); return () => clearInterval(i) }, [doc.id, fetchUrls])
  const earlier = data.documents.filter(d => d.status === 'superseded' && d.id !== doc.id && (doc.typeKey ? d.typeKey === doc.typeKey : d.supersededBy === doc.id))
  const remove = async () => {
    setBusy(true); setError(null)
    try { await call(token, 'delete', { documentId: doc.id }); onChanged(t('view.deleted')) } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }
  return (
    <SheetFrame title={name} onClose={onClose} wide>
      {editing ? (
        <DetailsForm initial={doc} read aiBanner={false} data={data} t={t} ts={ts} saveLabel={t('check.save')} onCancel={() => setEditing(false)}
          onSave={async d => { await call(token, 'update', { documentId: doc.id, details: d }); onChanged(t('check.saved')) }} />
      ) : (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-preview={doc.mime ?? ''}>
            {urls ? (doc.mime?.startsWith('image/')
              ? <img src={urls.open} alt={name} className="mx-auto max-h-[60vh] w-auto" />
              : <object data={urls.open} type="application/pdf" className="h-[60vh] w-full" aria-label={name}><p className="p-4 text-sm text-slate-600">{t('view.noPreview')}</p></object>)
              : <p className="p-4 text-sm text-slate-500" role={urlError ? 'alert' : 'status'}>{urlError ?? '…'}</p>}
          </div>
          {urls && (
            <div className="flex flex-wrap gap-2">
              <a href={urls.open} target="_blank" rel="noopener noreferrer" className={SECONDARY}>{t('view.open')}</a>
              <a href={urls.download} target="_blank" rel="noopener noreferrer" className={SECONDARY}>{t('view.download')}</a>
            </div>
          )}
          <section>
            <h3 className="mb-2 text-base font-bold text-slate-900">{t('view.details')}</h3>
            <dl className="space-y-1 text-sm text-slate-700">
              {doc.issuer && <div className="flex gap-2"><dt className="font-semibold">{t('check.issuer')}:</dt><dd>{doc.issuer}</dd></div>}
              {doc.issuedOn && <div className="flex gap-2"><dt className="font-semibold">{t('check.issued')}:</dt><dd>{shortDate(doc.issuedOn, ts)}</dd></div>}
              {doc.expiresOn && <div className="flex gap-2"><dt className="font-semibold">{data.types.find(x => x.key === doc.typeKey)?.dateLabel === 'review_by' ? t('check.reviewBy') : t('check.expires')}:</dt><dd>{shortDate(doc.expiresOn, ts)}</dd></div>}
              {doc.nameOnDocument && <div className="flex gap-2"><dt className="font-semibold">{t('check.nameOnDocument')}:</dt><dd>{doc.nameOnDocument}</dd></div>}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={SECONDARY} onClick={() => setEditing(true)}>{t('view.edit')}</button>
              <button type="button" className={SECONDARY} onClick={onRenew}>{t('view.renew')}</button>
            </div>
          </section>
          {earlier.length > 0 && (
            <section>
              <h3 className="mb-2 text-base font-bold text-slate-900">{t('view.earlier')}</h3>
              <ul className="space-y-1 text-sm text-slate-700">
                {earlier.map(e => <EarlierVersion key={e.id} token={token} doc={e} t={t} ts={ts} />)}
              </ul>
            </section>
          )}
          <section className="border-t border-slate-200 pt-4">
            {confirming ? (
              <div role="alertdialog" aria-label={t('view.delete')} className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-900">{t('view.deleteConfirm')}</p>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={remove} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{t('view.deleteYes')}</button>
                  <button type="button" onClick={() => setConfirming(false)} className={SECONDARY}>{t('view.keep')}</button>
                </div>
              </div>
            ) : <button type="button" onClick={() => setConfirming(true)} className="text-sm font-bold text-red-700">{t('view.delete')}</button>}
            {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
          </section>
        </div>
      )}
    </SheetFrame>
  )
}
function EarlierVersion({ token, doc, t, ts }: { token: string; doc: Doc; t: T; ts: TimeSettings }) {
  const open = async () => {
    // A fresh window first, then its address: a window opened after an await is blocked by Safari.
    const w = window.open('', '_blank')
    if (w) w.opener = null
    try { const r = await call(token, 'file_url', { documentId: doc.id }); if (w) w.location.href = r.url; else window.location.href = r.url } catch { w?.close() }
  }
  return (
    <li className="flex items-center justify-between gap-2">
      <span>{t('view.uploaded', { date: shortDate(instantYmd(doc.createdAt, ts), ts) })}{doc.expiresOn ? ` · ${shortDate(doc.expiresOn, ts)}` : ''}</span>
      <button type="button" onClick={open} className="font-semibold text-orange-700 underline">{t('view.open')}</button>
    </li>
  )
}

// ── send ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
function SendSheet({ token, data, chosen, labelOf, t, ts, onSent, onClose }: {
  token: string; data: Loaded; chosen: RowKey[]; labelOf: (k: RowKey) => string; t: T; ts: TimeSettings; onSent: (msg: string) => void; onClose: () => void
}) {
  const [emails, setEmails] = useState('')
  const [eventId, setEventId] = useState('')
  const [items, setItems] = useState<RowKey[]>(chosen)
  const [message, setMessage] = useState('')
  const event = data.events.find(e => e.id === eventId)
  // The date follows the chosen event (the day after it) until the truck picks one itself.
  const [untilPicked, setUntilPicked] = useState<string | null>(null)
  const until = untilPicked ?? defaultShareUntil(data.today, event?.date ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = { email: useId(), event: useId(), message: useId(), until: useId() }
  const send = async () => {
    const p = parseOrganiserEmails(emails)
    const problem = p.invalid.length ? t('send.emailInvalid', { email: p.invalid[0] }) : !p.emails.length ? t('send.emailNone')
      : p.emails.length > MAX_ORGANISER_EMAILS ? t('send.emailTooMany') : !items.length ? t('send.noDocuments')
      : until <= data.today || until > addDays(data.today, SHARE_MAX_DAYS) ? t('send.untilRange') : null
    if (problem) { setError(problem); return }
    setBusy(true); setError(null)
    try {
      const r = await call(token, 'share', {
        emails: p.emails.join(','), eventId: eventId || null, message, until,
        items: items.map(k => (k.startsWith('t:') ? { typeKey: k.slice(2) } : { documentId: k.slice(2) })),
      })
      onSent(t('send.sent', { emails: (r.sentTo as string[]).join(', ') }))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }
  return (
    <SheetFrame title={t('send.title')} onClose={onClose}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); send() }} data-form="send">
        <p className="text-slate-600">{t('send.intro')}</p>
        <div><label htmlFor={ids.email} className={LABEL}>{t('send.email')}</label>
          <input id={ids.email} type="text" inputMode="email" autoComplete="email" className={INPUT} value={emails} onChange={e => setEmails(e.target.value)} aria-describedby={`${ids.email}-h`} />
          <p id={`${ids.email}-h`} className="mt-1 text-xs text-slate-500">{t('send.emailHint')}</p></div>
        <div><label htmlFor={ids.event} className={LABEL}>{t('send.event')}</label>
          <select id={ids.event} className={SELECT} value={eventId} onChange={e => setEventId(e.target.value)}>
            <option value="">{t('send.noEvent')}</option>
            {data.events.map(e => <option key={e.id} value={e.id}>{[e.name, formatYmdShortMonth(e.date, ts, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</option>)}
          </select></div>
        <fieldset>
          <legend className={LABEL}>{t('send.documents')}</legend>
          <div className="flex flex-wrap gap-2">
            {chosen.map(k => {
              const on = items.includes(k)
              return <button key={k} type="button" aria-pressed={on} onClick={() => setItems(p => (on ? p.filter(x => x !== k) : [...p, k]))}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-slate-300 bg-slate-100 text-slate-800' : 'border-dashed border-slate-300 bg-white text-slate-400 line-through'}`}>{on ? '✓ ' : ''}{labelOf(k)}</button>
            })}
          </div>
        </fieldset>
        <div><label htmlFor={ids.message} className={LABEL}>{t('send.message')}</label>
          <textarea id={ids.message} rows={3} maxLength={1000} className={INPUT} placeholder={t('send.messagePlaceholder')} value={message} onChange={e => setMessage(e.target.value)} /></div>
        <div><label htmlFor={ids.until} className={LABEL}>{t('send.until')}</label>
          <input id={ids.until} type="date" className={INPUT} value={until} min={addDays(data.today, 1)} max={addDays(data.today, SHARE_MAX_DAYS)}
            onChange={e => setUntilPicked(e.target.value)} aria-describedby={`${ids.until}-h`} />
          <p id={`${ids.until}-h`} className="mt-1 text-xs text-slate-500">
            {event && until === addDays(event.date, 1) ? t('send.untilAfterEvent', { date: shortDate(until, ts) }) : shortDate(until, ts)}</p></div>
        {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
        <button type="submit" className={PRIMARY} disabled={busy}>{busy ? t('send.sending') : t('send.send')}</button>
        <p className="text-sm text-slate-500">{t('send.footer')}</p>
      </form>
    </SheetFrame>
  )
}

function SentList({ token, data, t, ts, onChanged }: { token: string; data: Loaded; t: T; ts: TimeSettings; onChanged: (msg: string) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = new Date()
  return (
    <section className="mt-8" aria-labelledby="paperwork-sent" data-section="sent">
      <h2 id="paperwork-sent" className="mb-3 text-lg font-bold text-slate-900">{t('sent.title')}</h2>
      {data.shares.length === 0 ? <p className="text-sm text-slate-500">{t('sent.empty')}</p> : (
        <ul className="space-y-3">
          {data.shares.map(s => {
            const state = shareState(s, now)
            return (
              <li key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm" data-share={state}>
                <p className="font-semibold text-slate-900">{t('sent.to', { emails: s.emails.join(', ') })}</p>
                <p className="text-slate-600">{t('sent.sentOn', { date: shortDate(instantYmd(s.createdAt, ts), ts) })} · {s.firstOpenedAt
                  ? t('sent.opened', { date: shortDate(instantYmd(s.firstOpenedAt, ts), ts), count: s.viewCount }) : t('sent.notOpened')}</p>
                <p className="text-slate-600">{state === 'off' ? t('sent.off') : state === 'expired'
                  ? t('sent.expiredOn', { date: shortDate(instantYmd(new Date(Date.parse(s.expiresAt) - 1).toISOString(), ts), ts) })
                  : t('sent.until', { date: shortDate(instantYmd(new Date(Date.parse(s.expiresAt) - 1).toISOString(), ts), ts) })}</p>
                {state === 'live' && (confirm === s.id ? (
                  <div className="mt-2 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="text-red-900">{t('sent.turnOffConfirm')}</p>
                    <div className="flex gap-2">
                      <button type="button" className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white" onClick={async () => {
                        try { await call(token, 'revoke', { shareId: s.id }); setConfirm(null); onChanged(t('sent.turnedOff')) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
                      }}>{t('sent.turnOff')}</button>
                      <button type="button" className={SECONDARY} onClick={() => setConfirm(null)}>{t('view.keep')}</button>
                    </div>
                  </div>
                ) : <button type="button" className="mt-2 font-bold text-red-700" onClick={() => setConfirm(s.id)}>{t('sent.turnOff')}</button>)}
              </li>
            )
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
    </section>
  )
}

// ── the tab ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function PaperworkTab({ token, showToast, initial }: { token: string; showToast: (msg: string, type?: 'success' | 'error') => void; initial?: Loaded }) {
  const t = useT('paperwork')
  const ts = useTruckTime()
  const money = moneyFormatOf(useCountrySettings())
  const [data, setData] = useState<Loaded | null>(initial ?? null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<RowKey[]>([])
  const [sheet, setSheet] = useState<Sheet>(null)

  const load = useCallback(async () => {
    try { setData(await call(token, 'load')); setLoadError(null) } catch (e) { setLoadError(e instanceof Error ? e.message : String(e)) }
  }, [token])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load of the tab's data from the server
  useEffect(() => { if (!initial) load() }, [load, initial])
  const done = (msg: string) => { setSheet(null); showToast(msg, 'success'); load() }

  const rows = useMemo(() => {
    if (!data) return []
    const current = data.documents.filter(d => d.status === 'current')
    const typed = data.types.map(ty => ({ key: `t:${ty.key}` as RowKey, type: ty as DocumentType | null, doc: current.find(d => d.typeKey === ty.key) ?? null, name: t(`types.${ty.key}` as never) }))
    const custom = current.filter(d => !d.typeKey).map(d => ({ key: `d:${d.id}` as RowKey, type: null as DocumentType | null, doc: d as Doc | null, name: d.customName ?? '' }))
    return [...typed, ...custom].map(r => ({ ...r, ...documentStatus(r.doc, data.today) }))
  }, [data, t])

  if (!data) {
    return loadError ? (
      <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-5" role="alert">
        <p className="text-red-900">{t('loadFailed')}</p>
        <button type="button" className={`${SECONDARY} mt-3`} onClick={load}>{t('retry')}</button>
      </div>
    ) : <p className="mx-auto max-w-2xl text-slate-500" role="status">{t('loading')}</p>
  }

  const count = (s: DocStatus) => rows.filter(r => r.status === s).length
  const line = (r: (typeof rows)[number]) => {
    if (!r.doc) return t('line.notUploaded')
    const review = r.type?.dateLabel === 'review_by'
    const parts: string[] = []
    if (r.doc.issuer) parts.push(r.doc.issuer)
    if (r.doc.coverAmountMinor && r.doc.currency) parts.push(t('line.cover', { amount: formatWholeAmount(r.doc.coverAmountMinor, { ...money, currency: r.doc.currency }) }))
    const date = r.doc.expiresOn ? shortDate(r.doc.expiresOn, ts) : null
    parts.push(!date ? t('line.noExpiry')
      : r.status === 'expired' ? (review ? t('line.reviewOverdue', { date }) : t('line.expired', { date }))
      : r.daysLeft === 0 && !review ? t('line.expiresToday')
      : r.status === 'due_soon' ? (review ? t('line.reviewByIn', { date, days: r.daysLeft ?? 0 }) : t('line.expiresIn', { date, days: r.daysLeft ?? 0 }))
      : review ? t('line.reviewBy', { date }) : t('line.expires', { date }))
    return parts.join(' · ')
  }
  const toggle = (k: RowKey) => setSelected(p => (p.includes(k) ? p.filter(x => x !== k) : [...p, k]))
  const labelOf = (k: RowKey) => rows.find(r => r.key === k)?.name ?? ''
  const chosen = selected.filter(k => rows.some(r => r.key === k && r.doc))
  const viewing = sheet?.kind === 'view' ? data.documents.find(d => d.id === sheet.docId) ?? null : null
  const CHIP: Record<DocStatus, string> = { expired: PILL.expired, due_soon: PILL.due_soon, missing: PILL.missing, up_to_date: PILL.up_to_date }

  return (
    <div className="mx-auto max-w-2xl pb-28" data-tab="paperwork">
      <h1 className="text-3xl font-bold text-slate-900">{t('title')}</h1>
      <p className="mt-2 text-lg leading-relaxed text-slate-600">{t('intro')}</p>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={t('title')}>
        {(['expired', 'due_soon', 'missing', 'up_to_date'] as const).map(s => (
          <li key={s} className={`rounded-full border px-3 py-1 text-sm font-bold ${CHIP[s]}`} data-count={s}>
            {s === 'expired' ? t('counts.expired', { count: count(s) }) : s === 'due_soon' ? t('counts.dueSoon', { count: count(s) })
              : s === 'missing' ? t('counts.missing', { count: count(s) }) : t('counts.upToDate', { count: count(s) })}
          </li>
        ))}
      </ul>
      <ul className="mt-5 space-y-3">
        {rows.map(r => (
          <li key={r.key} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-row={r.key} data-status={r.status}>
            <input type="checkbox" className="h-6 w-6 shrink-0 accent-orange-500 disabled:opacity-40" disabled={!r.doc} checked={selected.includes(r.key)}
              onChange={() => toggle(r.key)} aria-label={t('select', { document: r.name })} />
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSheet(r.doc ? { kind: 'view', docId: r.doc.id } : { kind: 'upload', typeKey: r.type?.key ?? null, replaces: null })}>
              <span className="block text-lg font-bold text-slate-900">{r.name}</span>
              <span className="block text-sm text-slate-600">{line(r)}</span>
            </button>
            {r.doc ? <StatusPill status={r.status} t={t} />
              : <button type="button" onClick={() => setSheet({ kind: 'upload', typeKey: r.type?.key ?? null, replaces: null })}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${PILL.missing}`}>{t('status.upload')}</button>}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setSheet({ kind: 'upload', typeKey: null, replaces: null })}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white py-4 text-lg font-bold text-slate-900 shadow-sm hover:bg-slate-50">{t('add')}</button>

      <SentList token={token} data={data} t={t} ts={ts} onChanged={done} />

      <div className="sticky bottom-0 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:mx-0 sm:rounded-2xl sm:border" data-bar="send">
        <span className="font-bold text-slate-900" aria-live="polite">{t('selected', { count: chosen.length })}</span>
        <button type="button" disabled={!chosen.length} onClick={() => setSheet({ kind: 'send' })}
          className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-40">{t('sendToOrganiser')}</button>
      </div>

      {sheet?.kind === 'upload' && <UploadSheet token={token} data={data} typeKey={sheet.typeKey} replaces={sheet.replaces} t={t} ts={ts} onClose={() => setSheet(null)} onDone={() => done(t('check.saved'))} />}
      {sheet?.kind === 'view' && viewing && <ViewSheet token={token} data={data} doc={viewing} t={t} ts={ts}
        name={viewing.typeKey ? t(`types.${viewing.typeKey}` as never) : (viewing.customName ?? '')}
        onChanged={done} onClose={() => setSheet(null)} onRenew={() => setSheet({ kind: 'upload', typeKey: viewing.typeKey, replaces: viewing.typeKey ? null : viewing.id })} />}
      {sheet?.kind === 'send' && <SendSheet token={token} data={data} chosen={chosen} labelOf={labelOf} t={t} ts={ts} onClose={() => setSheet(null)} onSent={msg => { setSelected([]); done(msg) }} />}
    </div>
  )
}
export type { Loaded as PaperworkLoaded }
