'use client'
// components/admin/PartnersTab.tsx — Admin › Partners (partners-1, 5 November 2026).
//
// A simple outreach list for associations, organisers, consultants, suppliers, directories and press.
//   LEFT  — the list: organisation, type, country, status pill, follow-up date; search; status / type / country
//           filters; "Due" (follow-up today or overdue); sorted by follow-up date, then priority. "Add" opens a short form.
//   RIGHT — the selected organisation: every field editable in place (InlineField), status and priority selectors,
//           the follow-up date, offered / outcome / notes; the timeline (emails both ways, notes, status changes, newest
//           first); "Write email" (the outreach ComposeWindow in its free-form mode) and "Add note".
// 🔴 NOTHING HERE IS A PROSPECT. No templates, snippets, sequences, demos, logos or screenshots; the send goes through
// /api/admin/partners/mail-send, which uses the outreach mail machinery and records the email with `partner_id`.
// ⚠️ THE RULES ARE IN lib/partners.ts (pure, proven by scripts/partners-1.cjs); this file renders their answers.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import InlineField from '@/components/admin/InlineField'
import ComposeWindow, { type ComposeSnapshot, type ReplyTarget } from '@/components/admin/ComposeWindow'
import EmailReadingPanel, { PAGE_HEADER_ID } from '@/components/admin/EmailReadingPanel'
import { getPartnerOutbox } from '@/components/admin/partner-outbox'
import { MAIL_STATUS_LABEL, mailStatusTone, FIELD_CLS, LABEL_CLS } from '@/components/admin/outreach-shared'
import { RowLabelCell } from '@/components/admin/outreach-icons'
import { messageRowLabel, type TimelineMessage } from '@/lib/outreach-timeline'
import type { OutboxEntry } from '@/lib/outreach-outbox'
import type { TemplateContext } from '@/lib/outreach-template-render'
import {
  PARTNER_TYPES, PARTNER_STATUSES, PARTNER_PRIORITIES, TYPE_LABEL, STATUS_LABEL, STATUS_TONE, PRIORITY_LABEL,
  filterPartners, isDue, londonToday, timelineOrder,
  type Partner, type PartnerStatus, type PartnerType, type PartnerPriority,
} from '@/lib/partners'

interface PartnerEvent { id: string; kind: 'note' | 'status'; body: string | null; from_status: string | null; to_status: string | null; created_at: string }
interface Detail { partner: Partner; messages: TimelineMessage[]; events: PartnerEvent[] }

const BTN = 'text-sm font-semibold px-3 py-1.5 rounded-lg border'
const fmtDay = (d: string | null) => {
  if (!d) return '—'
  const dt = new Date(d.length === 10 ? `${d}T12:00:00Z` : d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Europe/London' })
}
const fmtWhen = (d: string | null | undefined) => {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? String(d) : new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(dt)
}

async function api(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/admin/partners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return (await r.json().catch(() => ({ ok: false, refusal: `The server answered ${r.status}.` }))) as Record<string, unknown>
}

const EMPTY_OUTBOX: readonly OutboxEntry[] = []
function usePartnerOutbox(): readonly OutboxEntry[] {
  return useSyncExternalStore(fn => getPartnerOutbox().subscribe(fn), () => getPartnerOutbox().list(), () => EMPTY_OUTBOX)
}

export default function PartnersTab() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [loaded, setLoaded] = useState<'loading' | 'ok' | string>('loading')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<PartnerStatus | ''>('')
  const [type, setType] = useState<PartnerType | ''>('')
  const [country, setCountry] = useState('')
  const [dueOnly, setDueOnly] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = londonToday(new Date())

  const loadList = useCallback(async () => {
    const r = await fetch('/api/admin/partners').catch(() => null)
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; partners?: Partner[]; refusal?: string } | null
    if (!j || j.ok !== true) { setLoaded(j?.refusal ?? 'The partner list could not be read.'); return }
    setPartners(j.partners ?? [])
    setLoaded('ok')
  }, [])
  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/partners?id=${encodeURIComponent(id)}`).catch(() => null)
    const j = (await r?.json().catch(() => null)) as (Detail & { ok?: boolean; refusal?: string }) | null
    if (!j || j.ok !== true) { setError(j?.refusal ?? 'That partner could not be read.'); return }
    setDetail({ partner: j.partner, messages: j.messages, events: j.events })
  }, [])
  useEffect(() => { void Promise.resolve().then(loadList) }, [loadList])
  useEffect(() => { if (selectedId) void Promise.resolve().then(() => loadDetail(selectedId)) }, [selectedId, loadDetail])

  /** One partner row changed on the server: put it in the list and the detail. */
  const accept = useCallback((p: Partner) => {
    setPartners(list => list.some(x => x.id === p.id) ? list.map(x => (x.id === p.id ? p : x)) : [...list, p])
    setDetail(d => (d && d.partner.id === p.id ? { ...d, partner: p } : d))
  }, [])

  const save = useCallback(async (id: string, fields: Record<string, unknown>) => {
    setError(null)
    const j = await api({ action: 'update', id, fields })
    if (j.ok !== true) { setError(String(j.refusal ?? 'That could not be saved.')); return false }
    if (j.partner) accept(j.partner as Partner)
    return true
  }, [accept])

  const setStatusOf = useCallback(async (id: string, to: PartnerStatus) => {
    setError(null)
    const j = await api({ action: 'status', id, status: to })
    if (j.ok !== true) { setError(String(j.refusal ?? 'The status could not be changed.')); return }
    if (j.partner) accept(j.partner as Partner)
    await loadDetail(id)
  }, [accept, loadDetail])

  // When a partner send settles, re-read that partner (its status may have moved, and the email is on its timeline).
  useEffect(() => getPartnerOutbox().onSettled(e => {
    void loadList()
    if (e.prospectId === selectedId) void loadDetail(e.prospectId)
  }), [selectedId, loadList, loadDetail])

  const countries = useMemo(() => Array.from(new Set(partners.map(p => p.country_code).filter((c): c is string => !!c))).sort(), [partners])
  const shown = useMemo(() => filterPartners(partners, { q, status, type, country, dueOnly }, today), [partners, q, status, type, country, dueOnly, today])
  const dueCount = useMemo(() => partners.filter(p => isDue(p, today)).length, [partners, today])

  return (
    <div className="flex gap-4 items-start" data-partners-tab>
      {/* ── LEFT: the list ─────────────────────────────────────────────────────────────────────────── */}
      <section className="w-[380px] 2xl:w-[440px] shrink-0 bg-white border border-slate-200 rounded-xl flex flex-col sticky top-[104px] max-h-[calc(100vh-120px)]">
        <div className="p-2 border-b border-slate-100 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, contact, email, notes"
              aria-label="Search partners" className={`${FIELD_CLS} flex-1`} />
            <button type="button" onClick={() => setAdding(a => !a)} data-add-partner
              className={`${BTN} border-slate-800 bg-slate-800 text-white hover:bg-slate-900`}>{adding ? 'Close' : 'Add'}</button>
          </div>
          <div className="flex items-center gap-1.5">
            <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as PartnerStatus | '')} className={`${FIELD_CLS} !w-auto flex-1`}>
              <option value="">All statuses</option>
              {PARTNER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <select aria-label="Type" value={type} onChange={e => setType(e.target.value as PartnerType | '')} className={`${FIELD_CLS} !w-auto flex-1`}>
              <option value="">All types</option>
              {PARTNER_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <select aria-label="Country" value={country} onChange={e => setCountry(e.target.value)} className={`${FIELD_CLS} !w-auto`}>
              <option value="">All</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" onClick={() => setDueOnly(d => !d)} aria-pressed={dueOnly} data-due-filter
              title="Follow-up today or overdue"
              className={`text-xs font-bold px-2 py-1.5 rounded-lg border whitespace-nowrap ${dueOnly ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
              Due {dueCount}
            </button>
          </div>
          {adding && <AddForm onDone={p => { setAdding(false); accept(p); setSelectedId(p.id) }} />}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loaded === 'loading' && <p className="p-3 text-sm text-slate-500">Loading…</p>}
          {loaded !== 'loading' && loaded !== 'ok' && <p className="p-3 text-sm text-red-700">{loaded}</p>}
          {loaded === 'ok' && shown.length === 0 && (
            <p className="p-3 text-sm text-slate-500">{partners.length ? 'Nothing matches these filters.' : 'No partners yet — press Add.'}</p>
          )}
          <ul>
            {shown.map(p => {
              const due = isDue(p, today)
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setSelectedId(p.id)} data-partner-row
                    className={`w-full text-left px-3 py-1.5 border-b border-slate-100 hover:bg-slate-50 grid grid-cols-[1fr_auto] gap-x-2 items-center ${selectedId === p.id ? 'bg-orange-50' : ''}`}>
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {p.priority === 'high' && <span className="text-orange-600" title="High priority">● </span>}{p.name}
                    </span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                    <span className="truncate text-[11px] text-slate-500">{TYPE_LABEL[p.type]}{p.country_code ? ` · ${p.country_code}` : ''}{p.contact_name ? ` · ${p.contact_name}` : ''}</span>
                    <span className={`text-[11px] text-right ${due ? 'font-bold text-amber-700' : 'text-slate-400'}`}>{p.next_follow_up_on ? fmtDay(p.next_follow_up_on) : ''}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <p className="px-3 py-1 text-[11px] text-slate-400 border-t border-slate-100">{shown.length} of {partners.length}</p>
      </section>

      {/* ── RIGHT: the selected organisation ──────────────────────────────────────────────────────────── */}
      <section className="flex-1 min-w-0">
        {error && <p className="mb-2 text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>}
        {!selectedId && <p className="text-sm text-slate-500 p-6">Choose an organisation on the left, or press Add.</p>}
        {selectedId && detail && detail.partner.id === selectedId && (
          <PartnerDetail key={detail.partner.id} detail={detail} today={today}
            onSave={fields => save(detail.partner.id, fields)} onStatus={to => setStatusOf(detail.partner.id, to)}
            onReload={() => loadDetail(detail.partner.id)} />
        )}
      </section>
      <PartnerToasts />
    </div>
  )
}

// ── ADD ─────────────────────────────────────────────────────────────────────────────────────────────────
function AddForm({ onDone }: { onDone: (p: Partner) => void }) {
  const [f, setF] = useState({ name: '', type: 'association', country_code: 'GB', website: '', contact_name: '', contact_role: '', email: '', priority: 'medium', notes: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }))
  const submit = async () => {
    setBusy(true); setErr(null)
    const j = await api({ action: 'create', fields: f })
    setBusy(false)
    if (j.ok !== true) { setErr(String(j.refusal ?? 'That could not be added.')); return }
    onDone(j.partner as Partner)
  }
  return (
    <form data-add-form onSubmit={e => { e.preventDefault(); void submit() }} className="grid grid-cols-2 gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2">
      <label className="col-span-2"><span className={LABEL_CLS}>Organisation *</span><input type="text" required value={f.name} onChange={set('name')} className={FIELD_CLS} /></label>
      <label><span className={LABEL_CLS}>Type</span>
        <select value={f.type} onChange={set('type')} className={FIELD_CLS}>{PARTNER_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
      <label><span className={LABEL_CLS}>Country</span><input type="text" maxLength={2} value={f.country_code} onChange={set('country_code')} className={FIELD_CLS} /></label>
      <label className="col-span-2"><span className={LABEL_CLS}>Website</span><input type="text" value={f.website} onChange={set('website')} className={FIELD_CLS} /></label>
      <label><span className={LABEL_CLS}>Contact name</span><input type="text" value={f.contact_name} onChange={set('contact_name')} className={FIELD_CLS} /></label>
      <label><span className={LABEL_CLS}>Role</span><input type="text" value={f.contact_role} onChange={set('contact_role')} className={FIELD_CLS} /></label>
      <label><span className={LABEL_CLS}>Email</span><input type="email" value={f.email} onChange={set('email')} className={FIELD_CLS} /></label>
      <label><span className={LABEL_CLS}>Priority</span>
        <select value={f.priority} onChange={set('priority')} className={FIELD_CLS}>{PARTNER_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
      <label className="col-span-2"><span className={LABEL_CLS}>Notes</span><textarea rows={2} value={f.notes} onChange={set('notes')} className={FIELD_CLS} /></label>
      {err && <p className="col-span-2 text-[12px] text-red-700">{err}</p>}
      <button type="submit" disabled={busy || !f.name.trim()} className={`${BTN} col-span-2 border-slate-800 bg-slate-800 text-white disabled:opacity-40`}>{busy ? 'Adding…' : 'Add organisation'}</button>
    </form>
  )
}

// ── THE DETAIL ──────────────────────────────────────────────────────────────────────────────────────────
function PartnerDetail({ detail, today, onSave, onStatus, onReload }: {
  detail: Detail; today: string
  onSave: (fields: Record<string, unknown>) => Promise<boolean>
  onStatus: (to: PartnerStatus) => Promise<void>
  onReload: () => Promise<void>
}) {
  const p = detail.partner
  const [composing, setComposing] = useState(false)
  const [restore, setRestore] = useState<ComposeSnapshot | null>(null)
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  const [noting, setNoting] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [, setHold] = useState(false)
  const outbox = usePartnerOutbox()

  // Undo on a partner send hands the window back, exactly as it was.
  useEffect(() => getPartnerOutbox().onRestore(e => {
    if (e.prospectId !== p.id) return
    const snap = e.snapshot as { compose: ComposeSnapshot; replyTo: ReplyTarget | null }
    getPartnerOutbox().takeRestore(p.id)
    setRestore(snap.compose); setReplyTo(snap.replyTo); setComposing(true)
  }), [p.id])

  // Esc closes the reading panel (the page owns Esc, as on the prospect page).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = useMemo(() => timelineOrder([
    ...detail.messages.map(m => ({ kind: 'email' as const, id: m.id, at: m.message_date ?? m.created_at ?? null, m })),
    ...detail.events.map(e => ({ kind: e.kind, id: e.id, at: e.created_at, e })),
  ]), [detail])
  const emailIds = useMemo(() => items.filter(i => i.kind === 'email').map(i => i.id), [items])
  const opened = openId ? detail.messages.find(m => m.id === openId) ?? null : null
  const pending = outbox.filter(e => e.prospectId === p.id && (e.phase === 'waiting' || e.phase === 'sending'))

  const field = (k: keyof Partner, label: string, type: 'text' | 'email' = 'text', placeholder = '—') => (
    <div className="grid grid-cols-[92px_1fr] items-center gap-1">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <InlineField align="left" type={type} value={(p[k] as string | null) ?? null} placeholder={placeholder}
        onHold={setHold} onCommit={v => { void onSave({ [k]: v }) }} />
    </div>
  )

  const retry = async (id: string, confirmUncertain = false) => {
    const r = await fetch('/api/admin/partners/mail-send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry', message_row_id: id, partner_id: p.id, confirm_uncertain: confirmUncertain }) })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (j.needsConfirm === true && window.confirm(String(j.refusal))) return retry(id, true)
    if (j.ok !== true && j.refusal) window.alert(String(j.refusal))
    await onReload()
  }

  return (
    <div className="flex flex-col gap-3" data-partner-detail>
      {/* Header: who, and the controls you use most — all visible without scrolling. */}
      <div id={PAGE_HEADER_ID} className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <InlineField align="left" type="text" value={p.name} placeholder="Organisation" onHold={setHold} onCommit={v => { void onSave({ name: v }) }} />
        </div>
        <select aria-label="Type" value={p.type} onChange={e => void onSave({ type: e.target.value })} className={`${FIELD_CLS} !w-auto`}>
          {PARTNER_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select aria-label="Status" data-status-select value={p.status} onChange={e => void onStatus(e.target.value as PartnerStatus)}
          className={`text-sm font-bold rounded-lg px-2 py-1.5 border ${STATUS_TONE[p.status]}`}>
          {PARTNER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select aria-label="Priority" value={p.priority} onChange={e => void onSave({ priority: e.target.value as PartnerPriority })} className={`${FIELD_CLS} !w-auto`}>
          {PARTNER_PRIORITIES.map(x => <option key={x} value={x}>{PRIORITY_LABEL[x]} priority</option>)}
        </select>
        <label className="flex items-center gap-1 text-[12px] text-slate-600">
          Follow up
          <input type="date" value={p.next_follow_up_on ?? ''} onChange={e => void onSave({ next_follow_up_on: e.target.value })}
            className={`border rounded-lg px-2 py-1 text-sm ${isDue(p, today) ? 'border-amber-400 bg-amber-50 text-amber-900 font-semibold' : 'border-slate-200'}`} />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" data-write-email onClick={() => { setRestore(null); setReplyTo(null); setComposing(true) }}
            className={`${BTN} border-orange-600 bg-orange-600 text-white hover:bg-orange-700`}>Write email</button>
          <button type="button" data-add-note onClick={() => setNoting(n => !n)}
            className={`${BTN} border-slate-300 text-slate-700 bg-white hover:bg-slate-50`}>Add note</button>
        </div>
      </div>

      <div className="grid gap-3 items-start grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* Fields */}
        <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex flex-col gap-0.5">
          {field('contact_name', 'Contact')}
          {field('contact_role', 'Role')}
          {field('email', 'Email', 'email')}
          {field('phone', 'Phone')}
          {field('website', 'Website')}
          {field('linkedin_url', 'LinkedIn')}
          {field('country_code', 'Country', 'text', 'GB')}
          {field('region', 'Region')}
          {field('source', 'Found via')}
          <p className="text-[11px] text-slate-400 mt-1">
            Last emailed {fmtWhen(p.last_contacted_at)} · last reply {fmtWhen(p.last_reply_at)}
          </p>
          <LongField label="Offered" value={p.offered} onCommit={v => onSave({ offered: v })} />
          <LongField label="Outcome" value={p.outcome} onCommit={v => onSave({ outcome: v })} />
          <LongField label="Notes" value={p.notes} rows={4} onCommit={v => onSave({ notes: v })} />
        </div>

        {/* Compose, note, timeline */}
        <div className="flex flex-col gap-3 min-w-0">
          {composing && (
            <div className="bg-white border border-slate-200 rounded-xl px-3 py-2" data-partner-compose>
              <div className="flex items-center mb-1">
                <p className="text-sm font-bold text-slate-800">{replyTo ? 'Reply' : 'New email'} to {p.name}</p>
                <button type="button" onClick={() => setComposing(false)} className="ml-auto text-sm font-semibold px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">Close</button>
              </div>
              <ComposeWindow
                inline
                partner={{ id: p.id }}
                truckName={p.name}
                prospectId=""
                toEmail={p.email}
                contactName={p.contact_name}
                offerable={[]}
                suggestedId={null}
                ctx={{} as TemplateContext}
                whatsappConfirmed
                templatesLoaded
                logFormKind=""
                hideCopyAndLog
                onClose={() => setComposing(false)}
                onLog={async () => false}
                replyTo={replyTo}
                restore={restore}
                onQueued={() => { setComposing(false); setRestore(null); setReplyTo(null) }}
              />
            </div>
          )}
          {noting && <NoteBox partnerId={p.id} onDone={async () => { setNoting(false); await onReload() }} />}

          <div className="bg-white border border-slate-200 rounded-xl" data-partner-timeline>
            <p className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100">Timeline</p>
            {pending.map(e => (
              <div key={e.key} className="px-3 py-1.5 text-sm text-slate-500 border-b border-slate-100">Sending… {e.subject}</div>
            ))}
            {items.length === 0 && !pending.length && <p className="px-3 py-3 text-sm text-slate-500">Nothing yet — write the first email or add a note.</p>}
            <ul>
              {items.map(it => {
                if (it.kind === 'email') {
                  const m = (it as { m: TimelineMessage }).m
                  const flagged = ['failed', 'uncertain', 'bounced', 'bounce'].includes(String(m.status))
                  return (
                    <li key={it.id} className="border-b border-slate-100">
                      <button type="button" id={`tl-${m.id}`} onClick={() => setOpenId(m.id)} data-timeline-email
                        className={`w-full text-left px-3 py-1.5 grid grid-cols-[96px_1fr_auto] gap-2 items-baseline hover:bg-slate-50 ${openId === m.id ? 'bg-orange-50' : ''}`}>
                        <RowLabelCell label={messageRowLabel(m.direction)} />
                        <span className="min-w-0">
                          <span className="text-sm font-semibold text-slate-800">{m.subject ?? '(no subject)'}</span>
                          {m.is_test && <span className="ml-1 text-[10px] font-bold uppercase text-slate-400">test</span>}
                          {flagged && <span className={`ml-1 text-[10px] font-bold uppercase px-1 rounded border ${mailStatusTone({ status: String(m.status), direction: String(m.direction) })}`}>{MAIL_STATUS_LABEL[String(m.status)] ?? m.status}</span>}
                          {m.preview && <span className="block truncate text-[12px] text-slate-500">{m.preview}</span>}
                        </span>
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">{fmtWhen(it.at)}</span>
                      </button>
                    </li>
                  )
                }
                const e = (it as { e: PartnerEvent }).e
                return (
                  <li key={it.id} className="border-b border-slate-100 px-3 py-1.5 grid grid-cols-[96px_1fr_auto] gap-2 items-baseline" data-timeline-event={e.kind}>
                    <span className="text-[11px] font-bold uppercase text-slate-400">{e.kind === 'note' ? '✎ Note' : '↻ Status'}</span>
                    <span className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                      {e.kind === 'note' ? e.body : <>{STATUS_LABEL[e.from_status as PartnerStatus] ?? e.from_status ?? '—'} → <b>{STATUS_LABEL[e.to_status as PartnerStatus] ?? e.to_status}</b></>}
                    </span>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap">{fmtWhen(e.created_at)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      {opened && (
        <EmailReadingPanel message={opened} ids={emailIds} onOpen={setOpenId} onClose={() => setOpenId(null)}
          handLogged={null} prospectEmail={p.email}
          footer={<>
            {opened.direction === 'inbound' && !opened.is_test && (
              <button type="button" onClick={() => {
                setReplyTo({ messageId: opened.id, subject: opened.subject ?? null, fromAddress: opened.from_address ?? null, date: opened.message_date ?? null, inbound: true })
                setRestore(null); setComposing(true); setOpenId(null)
              }} className={`${BTN} border-orange-600 bg-orange-600 text-white`}>Reply</button>
            )}
            {(opened.status === 'failed' || opened.status === 'uncertain') && (
              <button type="button" onClick={() => void retry(opened.id)} className={`${BTN} border-slate-300 text-slate-700`}>Retry</button>
            )}
            {opened.last_error && <span className="text-[11px] text-red-700">{opened.last_error}</span>}
          </>} />
      )}
    </div>
  )
}

/** A text area that saves on blur, only when it changed (the InlineField rule, for long text). */
function LongField({ label, value, onCommit, rows = 2 }: { label: string; value: string | null; onCommit: (v: string) => Promise<boolean>; rows?: number }) {
  const [draft, setDraft] = useState(value ?? '')
  const seeded = useRef(value ?? '')
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) { setDraft(value ?? ''); seeded.current = value ?? '' } }, [value])
  return (
    <label className="block mt-1">
      <span className={LABEL_CLS}>{label}</span>
      <textarea rows={rows} value={draft} onChange={e => setDraft(e.target.value)}
        onFocus={() => { focused.current = true }}
        onBlur={() => { focused.current = false; if (draft.trim() !== seeded.current.trim()) { seeded.current = draft.trim(); void onCommit(draft) } }}
        className={`${FIELD_CLS} resize-y`} />
    </label>
  )
}

function NoteBox({ partnerId, onDone }: { partnerId: string; onDone: () => Promise<void> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    setBusy(true); setErr(null)
    const j = await api({ action: 'note', id: partnerId, body: text })
    setBusy(false)
    if (j.ok !== true) { setErr(String(j.refusal ?? 'The note could not be saved.')); return }
    await onDone()
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2" data-note-box>
      <textarea autoFocus rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="What happened, what was agreed…" className={`${FIELD_CLS} resize-y`} />
      <div className="flex items-center gap-2 mt-1">
        {err && <span className="text-[12px] text-red-700">{err}</span>}
        <button type="button" disabled={busy || !text.trim()} onClick={() => void save()}
          className={`ml-auto ${BTN} border-slate-800 bg-slate-800 text-white disabled:opacity-40`}>{busy ? 'Saving…' : 'Save note'}</button>
      </div>
    </div>
  )
}

/** The partner outbox's toasts: "Sending… Undo", then the verdict. */
function PartnerToasts() {
  const entries = usePartnerOutbox()
  useEffect(() => {
    const done = entries.filter(e => e.phase === 'sent' && !e.notice)
    if (!done.length) return
    const h = window.setTimeout(() => { for (const e of done) getPartnerOutbox().dismiss(e.key) }, 6_000)
    return () => window.clearTimeout(h)
  }, [entries])
  if (!entries.length) return null
  return (
    <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2 max-w-sm" role="status" aria-live="polite" data-partner-outbox>
      {entries.map(e => (
        <div key={e.key} className={`rounded-lg shadow-lg px-3 py-2 text-sm ${e.phase === 'not_sent' ? 'bg-red-50 border border-red-300 text-red-900'
          : e.phase === 'uncertain' ? 'bg-amber-50 border border-amber-300 text-amber-900' : 'bg-slate-900 text-white'}`}>
          <div className="flex items-center gap-3">
            <span className="flex-1">{e.phase === 'waiting' || e.phase === 'sending' ? (e.test ? 'Sending test…' : `Sending to ${e.prospectName ?? 'the partner'}…`) : e.message}</span>
            {e.phase === 'waiting' && <button type="button" onClick={() => getPartnerOutbox().undo(e.key)} className="font-bold underline">Undo</button>}
            {e.phase !== 'waiting' && e.phase !== 'sending' && <button type="button" aria-label="Close" onClick={() => getPartnerOutbox().dismiss(e.key)} className="font-bold opacity-70">✕</button>}
          </div>
          {e.phase === 'sent' && e.notice && <p className="mt-0.5 text-[12px] text-amber-200">{e.notice}</p>}
        </div>
      ))}
    </div>
  )
}
