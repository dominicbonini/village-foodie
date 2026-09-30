// components/admin/SequenceGrid.tsx — "Templates — who gets which".
//
// 🔴 THE GRID IS THE SEQUENCE. Rows are the four steps, columns are "All trucks (default)" then the
// four truck types, and each box holds exactly one template or nothing. A truck gets its own
// column's template, else the row default, else nothing — and "nothing" is shown as nothing, in
// red, rather than quietly becoming some other template.
//
// 🔴 WHAT IT REPLACES. `serves_kind` / `serves_lead_type` on the template rows, the `STEP_TEMPLATE`
// slug map in code, and `suggestTemplateId`'s heuristic — three mechanisms that could disagree
// about which template a step gets. The tag columns still exist and are still SHOWN, read-only, as
// "Used in" on each template; nothing reads them to choose.
//
// ⚠️ EVERY COUNT ON THIS SCREEN COMES FROM THE REAL FUNCTIONS — `nextStep` for the step and
// `effectiveLeadType` for the type, the same two the prospect page and the composer use. A second
// implementation would agree on the day it was written and drift afterwards, and the drift would
// surface as a number that disagreed with what the composer actually opened.
'use client'

import { useMemo, useState } from 'react'
import { CONTACT_KINDS, type LadderKind } from '@/lib/outreach'
import {
  LEAD_TYPES, LEAD_TYPE_LABELS, effectiveLeadType, leadTypeOf, isLeadTypeFrozen,
  type LeadType, type LeadTypeInput, type Step,
} from '@/lib/outreach-step'
import {
  ANY_LEAD, SLOT_LEAD_TYPES, STEP_LABELS, chooseTemplate, indexSlots, slotKey,
  type SequenceSlot, type SlotChannel, type SlotTemplate,
} from '@/lib/outreach-sequence'

/** ⚠️  EXACTLY, PLUS AN ID AND A NAME — not a second shape. The type derivations take
 *  this and nothing wider, so the grid cannot be handed a prospect the composer could not type. */
export type GridProspect = LeadTypeInput & { id: string; name?: string | null }

const CARD = 'rounded-2xl border border-slate-200 bg-white'
const LABEL = 'block text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5'

/** How each type is decided, in the words of `leadTypeOf` — so the panel cannot drift from the rule. */
const HOW_DECIDED: Record<LeadType, string> = {
  hu_ordering: 'hu_ordering is ticked on the truck row',
  hu_map: 'hu_ordering is not ticked and hu_map is',
  on_vf: 'neither is ticked, and the truck is on the Village Foodie map with something upcoming',
  not_listed: 'everything else — not on Hatches Up, and nothing upcoming on the map',
}

export default function SequenceGrid({
  templates, slots, leadLabels, prospects, steps, hasSequence, busy,
  onSetSlot, onClearSlot, onRename, onOpenProspect,
}: {
  templates: readonly SlotTemplate[]
  slots: readonly SequenceSlot[]
  leadLabels: Record<string, string> | null
  prospects: readonly GridProspect[]
  steps: ReadonlyMap<string, Step>
  hasSequence: boolean
  busy: boolean
  onSetSlot: (channel: SlotChannel, step: LadderKind, leadType: string, templateId: string) => Promise<void>
  onClearSlot: (channel: SlotChannel, step: LadderKind, leadType: string) => Promise<void>
  onRename: (leadType: LeadType, label: string) => Promise<void>
  onOpenProspect: (id: string) => void
}) {
  const [channel, setChannel] = useState<SlotChannel>('email')
  /** The last change, for Undo. One deep — this is a dropdown, not a document. */
  const [undo, setUndo] = useState<null | { label: string; revert: () => Promise<void> }>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const index = useMemo(() => indexSlots(slots), [slots])
  const name = (t: LeadType): string => leadLabels?.[t] ?? LEAD_TYPE_LABELS[t]
  const ofChannel = useMemo(
    () => templates.filter(t => t.channel === channel).slice().sort((a, b) => a.label.localeCompare(b.label)),
    [templates, channel])

  /**
   * 🔴 HOW MANY CONTACTABLE PROSPECTS ARE DUE AT THIS BOX, from the real derivations. A box with a
   * template and no prospects is not a mistake; a box with 40 prospects and no template is the
   * thing this screen exists to show.
   */
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of prospects) {
      const s = steps.get(p.id)
      if (!s || s.state !== 'due' || !s.kind || s.channel !== channel) continue
      const k = slotKey(channel, s.kind, s.leadType)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [prospects, steps, channel])

  /** The live count of each type across every prospect — what the Truck types panel shows. */
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of prospects) {
      const t = effectiveLeadType(p)
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    return m
  }, [prospects])

  /** 2d — the ones whose recorded type no longer matches today's data. */
  const changed = useMemo(() => prospects
    .filter(p => isLeadTypeFrozen(p) && effectiveLeadType(p) !== leadTypeOf(p))
    .map(p => ({ id: p.id, name: p.name ?? 'unnamed', was: effectiveLeadType(p), now: leadTypeOf(p) })),
    [prospects])

  const say = (m: string) => { setSaved(m); window.setTimeout(() => setSaved(null), 2000) }

  const change = async (step: LadderKind, lead: string, value: string) => {
    const before = index.get(slotKey(channel, step, lead)) ?? null
    const label = `${STEP_LABELS[step]} · ${lead === ANY_LEAD ? 'All trucks' : name(lead as LeadType)}`
    if (value === '') {
      await onClearSlot(channel, step, lead)
    } else {
      await onSetSlot(channel, step, lead, value)
    }
    say('saved')
    setUndo({
      label,
      revert: async () => {
        if (before) await onSetSlot(channel, step, lead, before.template_id)
        else await onClearSlot(channel, step, lead)
        setUndo(null)
        say('put back')
      },
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── THE GRID ──────────────────────────────────────────────────────────────────────────── */}
      <div className={`${CARD} p-3 flex flex-col gap-2`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-900">Templates — who gets which</span>
          <div className="flex items-center gap-1 ml-2">
            {(['email', 'whatsapp'] as const).map(c => (
              <button key={c} type="button" onClick={() => setChannel(c)} aria-pressed={channel === c}
                className={`text-xs font-bold px-2 py-1 rounded-lg border ${channel === c
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                {c === 'email' ? 'Email' : 'WhatsApp'}
              </button>
            ))}
          </div>
          {saved && <span className="text-[11px] font-semibold text-emerald-700">{saved}</span>}
          {undo && (
            <button type="button" onClick={() => void undo.revert()} disabled={busy}
              className="text-[11px] font-semibold text-slate-600 underline hover:no-underline disabled:opacity-40">
              Undo {undo.label}
            </button>
          )}
        </div>

        {!hasSequence && (
          <p className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
            The sequence grid needs <code>supabase/migrations/20260930_outreach_sequence_slots.sql</code> applying,
            and a PostgREST schema reload. Until then every box below is read-only and the composer
            pre-selects nothing.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-separate" style={{ borderSpacing: '4px' }}>
            <thead>
              <tr>
                <th className="text-left font-bold text-slate-500 w-28">Step</th>
                {SLOT_LEAD_TYPES.map(lt => (
                  <th key={lt} className="text-left font-bold text-slate-600 align-bottom">
                    {lt === ANY_LEAD ? 'All trucks (default)' : name(lt as LeadType)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CONTACT_KINDS.map(step => (
                <tr key={step}>
                  <th className="text-left font-bold text-slate-700 align-top pt-2">{STEP_LABELS[step]}</th>
                  {SLOT_LEAD_TYPES.map(lt => {
                    const own = index.get(slotKey(channel, step, lt))
                    const resolved = lt === ANY_LEAD
                      ? null
                      : chooseTemplate({ slots: index, templates, channel, step, leadType: lt })
                    const ownTemplate = own ? templates.find(t => t.uuid === own.template_id) ?? null : null
                    const inheritedName = !own && resolved?.slug ? resolved.label : null
                    const broken = !!ownTemplate && (!ownTemplate.active || ownTemplate.channel !== channel)
                    const nothing = !own && !inheritedName
                    const due = counts.get(slotKey(channel, step, lt)) ?? 0
                    return (
                      <td key={lt} className="align-top">
                        <select
                          disabled={!hasSequence || busy}
                          value={own?.template_id ?? ''}
                          onChange={e => void change(step, lt, e.target.value)}
                          className={`w-full rounded-lg border px-2 py-1.5 bg-white disabled:opacity-50 ${
                            broken || (nothing && lt === ANY_LEAD && due > 0) || (nothing && due > 0)
                              ? 'border-red-400 text-red-800' : 'border-slate-300 text-slate-800'}`}>
                          <option value="">
                            {lt === ANY_LEAD ? 'No template' : 'Same as default'}
                          </option>
                          {ofChannel.map(t => (
                            <option key={t.uuid} value={t.uuid}>{t.label}{t.active ? '' : ' (retired)'}</option>
                          ))}
                        </select>
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                          {/* ⚠️ ↳ MEANS INHERITED, and it names what is actually inherited — a column
                              that says "Same as default" without saying what the default IS makes you
                              look up a row to answer a question you are already looking at. */}
                          {inheritedName && <span className="text-[11px] text-slate-500">↳ {inheritedName}</span>}
                          {nothing && (
                            <span className="text-[11px] font-semibold text-red-700">
                              {lt === ANY_LEAD ? 'No template' : '↳ Nothing yet'}
                            </span>
                          )}
                          {broken && (
                            <span className="text-[11px] font-semibold text-red-700">
                              {ownTemplate && !ownTemplate.active ? 'retired — nothing will be sent' : 'wrong channel'}
                            </span>
                          )}
                          <span className={`text-[11px] ${due > 0 && (nothing || broken) ? 'font-bold text-red-700' : 'text-slate-400'}`}>
                            {due} due
                          </span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── TRUCK TYPES ───────────────────────────────────────────────────────────────────────── */}
      <div className={`${CARD} p-3 flex flex-col gap-2`}>
        <span className={LABEL}>Truck types</span>
        {/* 🔴 NAMES ONLY. The four types are decided by `leadTypeOf` in code and cannot be added to,
            removed or re-ordered here. What is editable is what they are CALLED, everywhere they are
            shown. */}
        <ul className="flex flex-col gap-1">
          {LEAD_TYPES.map(t => (
            <TypeRow key={t} type={t} label={name(t)} count={typeCounts.get(t) ?? 0}
              how={HOW_DECIDED[t]} busy={busy} onRename={onRename} />
          ))}
        </ul>
      </div>

      {/* ── CHANGED TYPE SINCE THE FIRST EMAIL ────────────────────────────────────────────────── */}
      <div className={`${CARD} p-3 flex flex-col gap-2`}>
        <span className={LABEL}>Changed type since first email</span>
        {changed.length === 0 ? (
          <p className="text-[12px] text-slate-400">None — every contacted prospect still matches the type it was approached as.</p>
        ) : (
          <>
            {/* ⚠️ THE SEQUENCE FOLLOWS THE FIRST EMAIL, and that is the point of the freeze rather
                than a bug in it: a chase must not be written as though the earlier one had said
                something else. This list is where you decide, one truck at a time, that the truck
                itself has genuinely changed. */}
            <p className="text-[11px] text-slate-500">
              These were approached as one type and would be typed differently today. The sequence keeps
              the first one until you say otherwise on the prospect.
            </p>
            <ul className="flex flex-col gap-1">
              {changed.map(c => (
                <li key={c.id} className="flex items-baseline gap-2 text-[12px]">
                  <span className="font-semibold text-slate-800">{c.name}</span>
                  <span className="text-slate-500">{name(c.was)} → {name(c.now)}</span>
                  <button type="button" onClick={() => onOpenProspect(c.id)}
                    className="ml-auto text-[11px] font-bold text-slate-600 underline hover:no-underline">Open</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function TypeRow({ type, label, count, how, busy, onRename }: {
  type: LeadType
  label: string
  count: number
  how: string
  busy: boolean
  onRename: (t: LeadType, label: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(label)
  return (
    <li className="flex flex-wrap items-baseline gap-2 text-[12px]">
      {editing ? (
        <>
          <input value={text} onChange={e => setText(e.target.value)} maxLength={40}
            className="border border-slate-300 rounded-lg px-2 py-1 text-[12px] w-56" />
          <button type="button" disabled={busy}
            onClick={() => void onRename(type, text.trim()).then(() => setEditing(false))}
            className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-800 bg-slate-800 text-white disabled:opacity-40">
            Save
          </button>
          <button type="button" onClick={() => { setText(label); setEditing(false) }}
            className="text-[11px] font-semibold text-slate-500 underline hover:no-underline">Cancel</button>
        </>
      ) : (
        <>
          <span className="font-semibold text-slate-800 w-56">{label}</span>
          <span className="text-slate-400">{count} truck{count === 1 ? '' : 's'}</span>
          <span className="text-slate-500 flex-1 min-w-[16rem]">{how}</span>
          <button type="button" onClick={() => { setText(label); setEditing(true) }}
            className="text-[11px] font-bold text-slate-600 underline hover:no-underline">Rename</button>
        </>
      )}
    </li>
  )
}
