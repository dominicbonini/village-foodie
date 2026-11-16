'use client'
// components/admin/PartnerProgramme.tsx — partners-2 (16 November 2026, docs/partners-2-report.md): the partner programme's pieces
// of Admin › Partners — the table, the code card and Codes panel, the send queue, the CSV import, a partner's programme box
// (verification, language, sequence, stop / opt-out) and the commission ledger. The approved mockup: one compact table, most
// actions visible, the same layout on a laptop and a desktop.
import { useEffect, useMemo, useState } from 'react'
import { STATUS_LABEL, STATUS_TONE, TYPE_LABEL, type Partner } from '@/lib/partners'
import { dealTextEn, offerCodeFor } from '@/lib/partner-codes'
import { nextSendLabel, type CountryRule, type ProgrammePartner } from '@/lib/partner-programme'
import { FIELD_CLS, LABEL_CLS } from '@/components/admin/outreach-shared'

export interface CodeRow {
  id: string; code: string; partner_id: string; deal_type: 'extra_trial_months' | 'percent_off' | 'fixed_price'; deal_value: number; deal_months: number | null
  deal_plan_key?: string | null; deal_currency?: string | null
  valid_until: string | null; max_uses: number | null; active: boolean; pct_year1: number; pct_year2: number; notes: string | null; created_at?: string | null
}
export interface Overview {
  codes: CodeRow[]; uses: Record<string, number>; queue: { partner_id: string; step: string; scheduled_at: string; status: string }[]
  lastSent: Record<string, string>; rules: Record<string, CountryRule>; schedule: { approvalMode: boolean; dailyCap: number }
  sentToday: number; today: string
  /** partners offer: the plans a percent-off / fixed-price code may name. */
  paidPlans?: { key: string; name: string }[]
}

const BTN = 'text-xs font-semibold px-2.5 py-1.5 rounded-lg border whitespace-nowrap'
const post = async (body: Record<string, unknown>) => {
  const r = await fetch('/api/admin/partners/programme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  return ((await r?.json().catch(() => null)) ?? { ok: false, refusal: 'The server could not be reached.' }) as Record<string, unknown>
}
const pct = (x: number) => `${Number.isInteger(Number(x)) ? Number(x) : Number(x).toFixed(1)}%`
const planLabel = (key: string) => key ? key.charAt(0).toUpperCase() + key.slice(1) : key
export const dealOf = (c: CodeRow, plans?: { key: string; name: string }[]) => dealTextEn({ dealType: c.deal_type, dealValue: c.deal_value, dealMonths: c.deal_months,
  dealPlanKey: c.deal_plan_key ?? null, dealCurrency: c.deal_currency ?? null }, k => plans?.find(p => p.key === k)?.name ?? planLabel(k))
/** partners offer: the partner's offer — its newest usable code (lib/partner-codes.ts offerCodeFor). None = "Needs offer". */
export const offerOf = (overview: Overview | null, partnerId: string) =>
  overview ? offerCodeFor(overview.codes, partnerId, overview.uses, overview.today || new Date().toISOString().slice(0, 10)) : null
export const commissionOf = (c: CodeRow) => (Number(c.pct_year2) > 0 ? `${pct(c.pct_year1)} / ${pct(c.pct_year2)}` : pct(c.pct_year1))
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })

export function VerifyMark({ v }: { v: Partner['verify_status'] }) {
  if (v === 'verified') return <span className="text-emerald-700 font-bold" title="Verified: the address is on their site and the domain takes mail">✓</span>
  if (v === 'unverified') return <span className="text-amber-600 font-bold" title="Unverified: the domain takes mail, but the address is not on their site">?</span>
  if (v === 'dropped') return <span className="text-red-600 font-bold" title="Dropped: no site, no mail server, or invented">✗</span>
  return <span className="text-slate-300">·</span>
}

// ── partners-3: the contact channel as a small icon / link in the Contact column (nothing else in the layout changes) ──
const CHANNEL_ICON: Record<string, string> = { email: '✉', contact_form: '📝', facebook: 'f', instagram: '◎', whatsapp: '💬', linkedin: 'in' }
export function ChannelLink({ p }: { p: Partner }) {
  const ch = p.channel ?? 'email'
  if (ch === 'email') return null
  const url = ch === 'facebook' ? p.facebook_url : ch === 'instagram' ? p.instagram_url : ch === 'contact_form' ? p.contact_form_url : ch === 'linkedin' ? p.linkedin_url : null
  const label = { contact_form: 'Contact form', facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', linkedin: 'LinkedIn' }[ch] ?? ch
  const badge = <span className="inline-block min-w-[16px] text-center text-[10px] font-bold px-1 rounded bg-sky-50 text-sky-800 border border-sky-200" title={`${label} — you send / DM`} data-channel={ch}>{CHANNEL_ICON[ch] ?? '•'}</span>
  return url ? <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-sky-800 underline">{badge}<span>{label}</span></a> : badge
}

// ── the table ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function PartnersTable({ rows, overview, selectedId, onOpen }: {
  rows: Partner[]; overview: Overview | null; selectedId: string | null; onOpen: (id: string) => void
}) {
  const codeOf = useMemo(() => {
    const m = new Map<string, CodeRow>()
    for (const p of rows) { const c = offerOf(overview, p.id); if (c) m.set(p.id, c) }
    return m
  }, [overview, rows])
  const queueOf = useMemo(() => new Map((overview?.queue ?? []).map(q => [q.partner_id, q])), [overview])
  return (
    <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl" data-partners-table>
      <table className="w-full text-[12px] leading-tight">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 sticky top-0">
          <tr>
            {['Organisation', 'Country', 'Lang', 'Contact', 'Status', 'Code', 'Deal', 'Comm.', 'Next send', 'Last'].map(h => (
              <th key={h} className="text-left font-semibold px-2 py-1.5 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(p => {
            const code = codeOf.get(p.id) ?? null
            const rule = p.country_code ? overview?.rules[p.country_code] ?? null : null
            const next = nextSendLabel({ ...(p as unknown as ProgrammePartner), has_offer: !!code }, rule, queueOf.get(p.id) ?? null)
            const last = overview?.lastSent[p.id]
            return (
              <tr key={p.id} onClick={() => onOpen(p.id)} data-partner-row
                className={`border-t border-slate-100 cursor-pointer hover:bg-orange-50/50 ${selectedId === p.id ? 'bg-orange-50' : ''} ${p.verify_status === 'dropped' ? 'text-slate-400' : ''}`}>
                <td className="px-2 py-1 max-w-[260px]">
                  <div className="truncate font-semibold text-slate-900">{p.name}</div>
                  <div className="text-[10px] text-slate-500">{TYPE_LABEL[p.type] ?? p.type}</div>
                </td>
                <td className="px-2 py-1 whitespace-nowrap">{p.country_code ?? '—'}{rule === 'manual_only' && <span className="ml-1 text-[9px] font-bold text-violet-700" title="Cold email only by hand in this country">✋</span>}</td>
                <td className="px-2 py-1 uppercase">{p.language ?? '—'}</td>
                <td className="px-2 py-1 max-w-[230px]">
                  <div className="truncate"><VerifyMark v={p.verify_status ?? null} /> <ChannelLink p={p} /> {p.email ?? <span className="text-slate-400">{p.channel && p.channel !== 'email' ? '' : 'no email'}</span>}</div>
                  {p.contact_name && <div className="truncate text-[10px] text-slate-500">{p.contact_name}</div>}
                </td>
                <td className="px-2 py-1"><span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span></td>
                <td className="px-2 py-1 font-mono text-[11px]">{code?.code ?? '—'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{code ? dealOf(code, overview?.paidPlans) : '—'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{code ? commissionOf(code) : '—'}</td>
                <td className={`px-2 py-1 whitespace-nowrap ${next === 'You send' ? 'text-violet-700 font-semibold' : next === 'Needs offer' ? 'text-amber-700 font-semibold' : next === 'Manual only' ? 'text-slate-500' : ''}`}>{next}</td>
                <td className="px-2 py-1 whitespace-nowrap text-slate-500">{last ? shortDay(last) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── a code card ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function CodeCard({ code, partnerName, uses, trucks, owedThisMonth, plans }: {
  code: CodeRow; partnerName: string; uses: number; trucks?: { id: string; name: string }[]; owedThisMonth?: string; plans?: { key: string; name: string }[]
}) {
  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white text-[12px]" data-code-card>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold text-slate-900">{code.code}</span>
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${code.active ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{code.active ? 'Active' : 'Off'}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-slate-500">Partner</dt><dd className="font-semibold">{partnerName}</dd>
        <dt className="text-slate-500">Deal</dt><dd>{dealOf(code, plans)}</dd>
        <dt className="text-slate-500">Commission</dt><dd>{pct(code.pct_year1)} of plan fees in year 1{Number(code.pct_year2) > 0 ? `, ${pct(code.pct_year2)} in year 2` : ''}</dd>
        <dt className="text-slate-500">Valid</dt><dd>{code.valid_until ? `until ${code.valid_until}` : 'no end date'} · {uses} use{uses === 1 ? '' : 's'}{code.max_uses ? ` of ${code.max_uses}` : ''}</dd>
        <dt className="text-slate-500">Trucks</dt><dd>{trucks === undefined ? '…' : trucks.length ? trucks.map(t => t.name).join(', ') : 'none yet'}</dd>
        <dt className="text-slate-500">Owed this month</dt><dd>{owedThisMonth ?? '…'}</dd>
      </dl>
    </div>
  )
}

// ── the Codes panel: every code (partners offer, 16 November 2026: a code is created by hand in its partner's drawer) ─────────
export function CodesPanel({ overview, partners }: { overview: Overview | null; partners: Partner[]; onSaved?: () => void }) {
  const name = (id: string) => partners.find(p => p.id === id)?.name ?? '—'
  return (
    <div className="space-y-3" data-codes-panel>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(overview?.codes ?? []).map(c => <CodeCard key={c.id} code={c} partnerName={name(c.partner_id)} uses={overview?.uses[c.id] ?? 0} plans={overview?.paidPlans} />)}
        {!(overview?.codes ?? []).length && <p className="text-sm text-slate-500">No codes yet.</p>}
      </div>
      <p className="text-[12px] text-slate-500">A code is created in its partner&apos;s drawer, with its deal and commission. A partner without one shows &ldquo;Needs offer&rdquo; and is never sent.</p>
    </div>
  )
}

// ── a new code, in the partner's drawer: every term chosen by hand — nothing is filled in ────────────────────────────────────
const EMPTY_CODE = { code: '', deal_type: '', deal_value: '', deal_months: '', deal_plan_key: '', deal_currency: '', price: '', valid_until: '', max_uses: '', pct_year1: '', pct_year2: '' }
export function CodeForm({ partner, overview, onSaved }: { partner: Partner; overview: Overview | null; onSaved: () => void }) {
  const [f, setF] = useState(EMPTY_CODE)
  const [msg, setMsg] = useState<string | null>(null)
  const set = (k: keyof typeof EMPTY_CODE) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    setMsg(null)
    const fixed = f.deal_type === 'fixed_price'
    const deal_value = fixed ? (f.price.trim() ? String(Math.round(parseFloat(f.price.replace(',', '.')) * 100)) : '') : f.deal_value
    const j = await post({ action: 'code_save', fields: { ...f, deal_value, partner_id: partner.id } })
    if (j.ok !== true) { setMsg(String(j.refusal)); return }
    setMsg(`Saved ${(j.code as CodeRow).code}.`); setF(EMPTY_CODE); onSaved()
  }
  const t = f.deal_type
  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50" data-code-form>
      <p className={LABEL_CLS}>New code for {partner.name}</p>
      <div className="mt-1 grid gap-2 grid-cols-2 lg:grid-cols-4">
        <input className={FIELD_CLS} placeholder="Code" aria-label="Code" value={f.code} onChange={set('code')} />
        <select className={FIELD_CLS} aria-label="Deal" value={t} onChange={set('deal_type')}>
          <option value="">Deal…</option>
          <option value="extra_trial_months">Extra trial months</option>
          <option value="percent_off">% off a plan for N months</option>
          <option value="fixed_price">Fixed monthly price for N months</option>
        </select>
        {t === 'extra_trial_months' && <input className={FIELD_CLS} placeholder="Extra months" aria-label="Extra months" value={f.deal_value} onChange={set('deal_value')} />}
        {t === 'percent_off' && <input className={FIELD_CLS} placeholder="% off" aria-label="Percent off" value={f.deal_value} onChange={set('deal_value')} />}
        {t === 'fixed_price' && <input className={FIELD_CLS} placeholder="Price a month, e.g. 19.00" aria-label="Monthly price" value={f.price} onChange={set('price')} />}
        {t === 'fixed_price' && <input className={FIELD_CLS} placeholder="Currency, e.g. EUR" aria-label="Currency" value={f.deal_currency} onChange={set('deal_currency')} />}
        {(t === 'percent_off' || t === 'fixed_price') && (
          <select className={FIELD_CLS} aria-label="Plan" value={f.deal_plan_key} onChange={set('deal_plan_key')}>
            <option value="">Plan…</option>
            {t === 'percent_off' && <option value="any">Any paid plan</option>}
            {(overview?.paidPlans ?? []).map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        )}
        {(t === 'percent_off' || t === 'fixed_price') && <input className={FIELD_CLS} placeholder="For N months" aria-label="Months" value={f.deal_months} onChange={set('deal_months')} />}
        <input className={FIELD_CLS} type="date" title="Valid until (optional)" aria-label="Valid until" value={f.valid_until} onChange={set('valid_until')} />
        <input className={FIELD_CLS} placeholder="Max uses (optional)" aria-label="Max uses" value={f.max_uses} onChange={set('max_uses')} />
        <input className={FIELD_CLS} placeholder="Commission yr 1 %" aria-label="Commission year 1" value={f.pct_year1} onChange={set('pct_year1')} />
        <input className={FIELD_CLS} placeholder="Commission yr 2 %" aria-label="Commission year 2" value={f.pct_year2} onChange={set('pct_year2')} />
        <button type="button" onClick={save} className={`${BTN} border-slate-800 bg-slate-800 text-white`}>Save code</button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">A % off or fixed price starts when the truck moves onto that paid plan, and lasts N months from that day.</p>
      {msg && <p className="mt-1 text-[12px] text-slate-700">{msg}</p>}
    </div>
  )
}

// ── the send queue ───────────────────────────────────────────────────────────────────────────────────────────────────────
interface QueueItem { partnerId: string; name: string; email: string; language: string; step: string; at: string; tz: string; template: string
  preview: { subject: string; body: string } | null; problem: string | null; status: string }
export function QueuePanel({ approvalMode, onChanged }: { approvalMode: boolean; onChanged: () => void }) {
  const [data, setData] = useState<{ plan: { sendDay: string; cap: number; sentToday: number; planned: QueueItem[]; later: { name: string; reason: string; nextDay: string }[] } } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = async () => {
    const r = await fetch('/api/admin/partners/programme?view=queue').catch(() => null)
    const j = await r?.json().catch(() => null)
    if (j?.ok) setData(j); else setMsg(j?.refusal ?? 'The queue could not be read.')
  }
  useEffect(() => { void Promise.resolve().then(load) }, [])
  const act = async (body: Record<string, unknown>, done: string) => { const j = await post(body); setMsg(j.ok === true ? done : String(j.refusal)); await load(); onChanged() }
  const local = (iso: string, tz: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso))
  return (
    <div className="space-y-2" data-queue-panel>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="font-semibold">{data ? `${data.plan.planned.length} planned today · ${data.plan.sentToday} of ${data.plan.cap} already sent today (trucks + partners)` : 'Loading…'}</span>
        <span className="flex-1" />
        <button type="button" className={`${BTN} border-slate-300 bg-white`} onClick={() => act({ action: 'plan_today' }, 'Today’s plan saved.')}>Save today’s plan</button>
        <button type="button" className={`${BTN} border-emerald-700 bg-emerald-700 text-white`} onClick={() => act({ action: 'approve_today' }, 'Approved — they go at their times.')}>Approve today’s sends</button>
        <label className="flex items-center gap-1 text-[11px] text-slate-600" title="Off: planned sends go without approval">
          <input type="checkbox" checked={approvalMode} onChange={e => act({ action: 'set_approval', on: e.target.checked }, e.target.checked ? 'Approval mode on.' : 'Approval mode off.')} />
          Approval mode
        </label>
      </div>
      {msg && <p className="text-[12px] text-slate-700">{msg}</p>}
      <p className="text-[11px] text-slate-500">Each email goes in the recipient’s own time zone, Tue–Thu 09:30–11:30, 3–8 minutes apart, never more than {data?.plan.cap ?? 25} a day across all outreach. A reply, a bounce or an opt-out stops the sequence. Public holidays are not applied.</p>
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
        {(data?.plan.planned ?? []).map(q => (
          <li key={`${q.partnerId}-${q.step}`} className="p-2 text-[12px]" data-queue-item>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="font-semibold">{q.name}</span>
              <span className="text-slate-600">{q.email}</span>
              <span className="uppercase text-slate-500">{q.language}</span>
              <span className="text-slate-500">{q.step.replace(/^\d_/, '').replace(/_/g, ' ')}</span>
              <span className="text-slate-700">{local(q.at, q.tz)} their time</span>
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${q.status === 'approved' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{q.status === 'not_saved' ? 'planned' : q.status}</span>
            </div>
            {q.preview
              ? <details className="mt-1"><summary className="cursor-pointer text-slate-700">{q.preview.subject}</summary><pre className="mt-1 whitespace-pre-wrap font-sans text-[12px] text-slate-700">{q.preview.body}</pre></details>
              : <p className="mt-1 text-amber-800">{q.problem}</p>}
          </li>
        ))}
        {data && !data.plan.planned.length && <li className="p-2 text-[12px] text-slate-500">Nothing due today.</li>}
      </ul>
      {!!data?.plan.later.length && (
        <p className="text-[11px] text-slate-500">Later: {data.plan.later.slice(0, 12).map(l => `${l.name} (${l.nextDay})`).join(' · ')}{data.plan.later.length > 12 ? ` · +${data.plan.later.length - 12}` : ''}</p>
      )}
    </div>
  )
}

// ── the CSV import ───────────────────────────────────────────────────────────────────────────────────────────────────────
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const cells = (l: string) => { const out: string[] = []; let cur = '', q = false
    for (let i = 0; i < l.length; i++) { const ch = l[i]
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch }
    out.push(cur); return out.map(c => c.trim()) }
  const head = cells(lines[0]).map(h => h.toLowerCase())
  return lines.slice(1).map(l => Object.fromEntries(cells(l).map((v, i) => [head[i], v]).filter(([k, v]) => k && v)))
}
export function ImportPanel({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('')
  const [res, setRes] = useState<Record<string, unknown> | null>(null)
  const run = async (dry: boolean) => { const j = await post({ action: 'import_csv', rows: parseCsv(text), dry_run: dry }); setRes(j); if (!dry && j.ok === true) onDone() }
  return (
    <div className="space-y-2" data-import-panel>
      <p className="text-[12px] text-slate-600">Paste CSV with a header row: <code>name,type,country_code,region,website,email,contact_name,language</code>. Rows already present (same email, or same name and country) are skipped. Imported rows are “? unverified” until checked — only ✓ rows are ever sent automatically.</p>
      <textarea className={`${FIELD_CLS} h-32 font-mono text-[11px]`} value={text} onChange={e => setText(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" className={`${BTN} border-slate-300 bg-white`} onClick={() => run(true)}>Preview</button>
        <button type="button" className={`${BTN} border-slate-800 bg-slate-800 text-white`} onClick={() => run(false)}>Import</button>
      </div>
      {res && <p className="text-[12px] text-slate-700">{res.ok === true
        ? `${(res.add as unknown[]).length} to add · ${(res.skipped as unknown[]).length} already present · ${(res.invalid as unknown[]).length} invalid${typeof res.inserted === 'number' && res.inserted ? ` · ${res.inserted} added` : ''}`
        : String(res.refusal)}</p>}
    </div>
  )
}

// ── a partner's programme box and ledger ─────────────────────────────────────────────────────────────────────────────────
interface Ledger { codes: { codeId: string; code: string; trucks: { id: string; name: string }[] }[]
  months: { month: string; currency: string; owedMinor: number; paidMinor: number; outstandingMinor: number }[] }
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100)

export function ProgrammeBox({ partner, overview, onSave, onChanged }: {
  partner: Partner; overview: Overview | null; onSave: (f: Record<string, unknown>) => Promise<boolean>; onChanged: () => void
}) {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [pay, setPay] = useState({ month: '', currency: 'GBP', amount: '', paid_on: '', reference: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const loadLedger = async () => {
    const r = await fetch(`/api/admin/partners/programme?view=ledger&partner_id=${encodeURIComponent(partner.id)}`).catch(() => null)
    const j = await r?.json().catch(() => null)
    if (j?.ok) setLedger(j.ledger)
  }
  useEffect(() => { void Promise.resolve().then(loadLedger) }, [partner.id])   // eslint-disable-line react-hooks/exhaustive-deps
  const codes = (overview?.codes ?? []).filter(c => c.partner_id === partner.id)
  const rule = partner.country_code ? overview?.rules[partner.country_code] ?? null : null
  const thisMonth = (overview?.today ?? '').slice(0, 7)
  const owed = (ledger?.months ?? []).filter(m => m.month === thisMonth)
  const stop = async (why: 'manual' | 'opt_out') => { const j = await post({ action: 'stop', partner_id: partner.id, why }); setMsg(j.ok === true ? (why === 'opt_out' ? 'Opted out: never emailed again.' : 'Sequence stopped.') : String(j.refusal)); onChanged() }
  const markPaid = async () => {
    const j = await post({ action: 'mark_paid', partner_id: partner.id, month: pay.month, currency: pay.currency, amount_minor: Math.round(parseFloat(pay.amount) * 100), paid_on: pay.paid_on, reference: pay.reference })
    setMsg(j.ok === true ? 'Payment recorded.' : String(j.refusal)); if (j.ok === true) void loadLedger()
  }
  return (
    <div className="space-y-3" data-programme-box>
      <div className="border border-slate-200 rounded-xl p-3 bg-white text-[12px] grid gap-1 sm:grid-cols-2">
        <p><span className="text-slate-500">Contact:</span> <VerifyMark v={partner.verify_status ?? null} /> {partner.verify_status ?? 'not checked'}{partner.verify_evidence && <> · <a className="text-orange-700 underline" href={partner.verify_evidence} target="_blank" rel="noreferrer">evidence</a></>}</p>
        <p><span className="text-slate-500">Sending:</span> {!offerOf(overview, partner.id) && partner.type !== 'software_platform' ? 'Needs offer (no usable code yet)' : rule === 'manual_only' ? 'You send (manual-only country)' : partner.type === 'software_platform' ? 'Manual only (software platform)' : partner.verify_status !== 'verified' ? 'Manual only (not verified)' : partner.sequence_stopped ? `Stopped (${partner.sequence_stopped})` : `Automatic · last step ${partner.sequence_step ?? 'none'}`}</p>
        {partner.alternate_emails && partner.alternate_emails.length > 0 && <p className="sm:col-span-2"><span className="text-slate-500">Also:</span> {partner.alternate_emails.join(', ')}</p>}
        {partner.verify_note && <p className="sm:col-span-2 text-slate-600">{partner.verify_note}</p>}
        <label className="flex items-center gap-1"><span className="text-slate-500">Language</span>
          <input className={`${FIELD_CLS} !w-16`} defaultValue={partner.language ?? ''} onBlur={e => { if (e.target.value !== (partner.language ?? '')) void onSave({ language: e.target.value }) }} /></label>
        <label className="flex items-center gap-1"><span className="text-slate-500">Time zone</span>
          <input className={`${FIELD_CLS} !w-44`} defaultValue={partner.timezone ?? ''} onBlur={e => { if (e.target.value !== (partner.timezone ?? '')) void onSave({ timezone: e.target.value }) }} /></label>
        <div className="sm:col-span-2 flex gap-2">
          <button type="button" className={`${BTN} border-slate-300 bg-white`} onClick={() => stop('manual')}>Stop sequence</button>
          <button type="button" className={`${BTN} border-red-300 bg-white text-red-700`} onClick={() => stop('opt_out')}>Opted out</button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {codes.map(c => {
          const l = ledger?.codes.find(x => x.codeId === c.id)
          return <CodeCard key={c.id} code={c} partnerName={partner.name} uses={overview?.uses[c.id] ?? 0} trucks={l?.trucks} plans={overview?.paidPlans}
            owedThisMonth={ledger ? (owed.length ? owed.map(m => money(m.owedMinor, m.currency)).join(' + ') : money(0, 'GBP')) : undefined} />
        })}
        {!codes.length && <p className="text-[12px] text-slate-500">No code for this partner yet, so it <b>Needs offer</b>: nothing is queued or sent until you create one below.</p>}
      </div>
      <CodeForm partner={partner} overview={overview} onSaved={onChanged} />
      <div className="border border-slate-200 rounded-xl p-3 bg-white text-[12px]" data-ledger>
        <p className={LABEL_CLS}>Commission ledger</p>
        <table className="w-full mt-1">
          <thead className="text-[10px] uppercase text-slate-500"><tr><th className="text-left">Month</th><th className="text-right">Owed</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th></tr></thead>
          <tbody>
            {(ledger?.months ?? []).map(m => (
              <tr key={`${m.month}-${m.currency}`} className="border-t border-slate-100">
                <td>{m.month}</td><td className="text-right">{money(m.owedMinor, m.currency)}</td><td className="text-right">{money(m.paidMinor, m.currency)}</td><td className="text-right font-semibold">{money(m.outstandingMinor, m.currency)}</td>
              </tr>
            ))}
            {ledger && !ledger.months.length && <tr><td colSpan={4} className="text-slate-500 pt-1">Nothing owed yet — commission is a share of plan fees referred trucks have paid (billing is off, so £0 until it is on).</td></tr>}
          </tbody>
        </table>
        <div className="mt-2 grid gap-1 grid-cols-2 lg:grid-cols-6 items-center">
          <input className={FIELD_CLS} placeholder="Month YYYY-MM" value={pay.month} onChange={e => setPay({ ...pay, month: e.target.value })} />
          <input className={FIELD_CLS} placeholder="GBP" value={pay.currency} onChange={e => setPay({ ...pay, currency: e.target.value })} />
          <input className={FIELD_CLS} placeholder="Amount" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} />
          <input className={FIELD_CLS} type="date" value={pay.paid_on} onChange={e => setPay({ ...pay, paid_on: e.target.value })} />
          <input className={FIELD_CLS} placeholder="Reference" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} />
          <button type="button" className={`${BTN} border-slate-800 bg-slate-800 text-white`} onClick={markPaid}>Mark paid</button>
        </div>
      </div>
      {msg && <p className="text-[12px] text-slate-700">{msg}</p>}
    </div>
  )
}
