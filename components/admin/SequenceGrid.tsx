// components/admin/SequenceGrid.tsx — "Templates — Sequence view".
//
// 🔴 THE GRID IS THE SEQUENCE. Columns are the four steps, in the order they happen, each showing
// WHEN it happens; rows are "All trucks (default)" and the four truck types, each showing how many
// trucks are of that type. A cell holds exactly one template or nothing.
//
// 🔴 WHAT CHANGED FROM THE FIRST VERSION, AND WHY:
//   • THE AXES SWAPPED. Steps read left-to-right because that is the order they happen in, and a
//     truck type is a row you read across — "what does an HU-map truck get, all the way through".
//   • CELLS ARE LABELS, NOT DROPDOWNS. Twenty always-open `<select>`s is twenty controls shouting at
//     once, and a select shows its value truncated with no room for "↳ inherited from the default".
//     A cell now READS, and opens its picker when clicked.
//   • THE TRUCK-TYPES PANEL AND THE CHANGED-TYPE PANEL ARE GONE. Both were standing blocks below the
//     grid answering questions nobody had while looking at it. The definitions live behind an ⓘ on
//     the row they define; the changed-type list is one amber line above the grid, and nothing at all
//     when there is nothing to say.
//   • "0 due" IS NEVER PRINTED. A column of zeroes is a column of noise; the pill appears only when
//     there are trucks waiting at that box.
//
// ⚠️ EVERY COUNT COMES FROM THE REAL FUNCTIONS — `nextStep` for the step, `effectiveLeadType` for the
// type. A second implementation would agree on the day it was written and drift afterwards.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CONTACT_KINDS, FOLLOW_UP_DAYS, type LadderKind } from '@/lib/outreach'
import {
  LEAD_TYPE_LABELS, effectiveLeadType, leadTypeOf, isLeadTypeFrozen,
  type LeadType, type LeadTypeInput, type Step,
} from '@/lib/outreach-step'
import {
  ANY_LEAD, SLOT_LEAD_TYPES, STEP_LABELS, chooseTemplate, indexSlots, slotKey, stepOffsetLabel,
  type SequenceSlot, type SlotChannel, type SlotTemplate,
} from '@/lib/outreach-sequence'

export type GridProspect = LeadTypeInput & { id: string; name?: string | null }

const CARD = 'rounded-2xl border border-slate-200 bg-white'

/** How each type is decided, in the words of `leadTypeOf` — so the popover cannot drift from the rule. */
const HOW_DECIDED: Record<LeadType, string> = {
  hu_ordering: 'hu_ordering is ticked on the truck row',
  hu_map: 'hu_ordering is not ticked and hu_map is',
  on_vf: 'neither is ticked, and the truck is on the Village Foodie map with something upcoming',
  not_listed: 'everything else — not on Hatches Up, and nothing upcoming on the map',
}

export default function SequenceGrid({
  templates, slots, leadLabels, prospects, steps, hasSequence, busy, highlight,
  onSetSlot, onClearSlot, onRename, onOpenProspect, onOpenTemplate, onNewTemplate,
}: {
  templates: readonly SlotTemplate[]
  slots: readonly SequenceSlot[]
  leadLabels: Record<string, string> | null
  prospects: readonly GridProspect[]
  steps: ReadonlyMap<string, Step>
  hasSequence: boolean
  busy: boolean
  /** A box to outline, from a "Used in" chip on the Templates view. `channel|step|lead_type`. */
  highlight?: string | null
  onSetSlot: (channel: SlotChannel, step: LadderKind, leadType: string, templateId: string) => Promise<void>
  onClearSlot: (channel: SlotChannel, step: LadderKind, leadType: string) => Promise<void>
  onRename: (leadType: LeadType, label: string) => Promise<void>
  onOpenProspect: (id: string) => void
  /** Open this template in the Templates view — the ↗ on a filled cell. */
  onOpenTemplate: (uuid: string) => void
  /** "+ Write a new one for this box" — opens the Templates view's new-template form. Creates nothing. */
  onNewTemplate: (channel: SlotChannel) => void
}) {
  const [channel, setChannel] = useState<SlotChannel>('email')
  /** The cell whose picker is open. Null ⇒ none; one at a time, by construction. */
  const [editing, setEditing] = useState<string | null>(null)
  const [undo, setUndo] = useState<null | { label: string; revert: () => Promise<void> }>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [infoFor, setInfoFor] = useState<LeadType | null>(null)

  const index = useMemo(() => indexSlots(slots), [slots])
  const name = (t: LeadType): string => leadLabels?.[t] ?? LEAD_TYPE_LABELS[t]
  const ofChannel = useMemo(
    () => templates.filter(t => t.channel === channel && t.active).slice().sort((a, b) => a.label.localeCompare(b.label)),
    [templates, channel])

  /** 🔴 CONTACTABLE PROSPECTS DUE AT THIS BOX, from the real derivations. */
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

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of prospects) {
      const t = effectiveLeadType(p)
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    return m
  }, [prospects])

  const changed = useMemo(() => prospects
    .filter(p => isLeadTypeFrozen(p) && effectiveLeadType(p) !== leadTypeOf(p))
    .map(p => ({ id: p.id, name: p.name ?? 'unnamed', was: effectiveLeadType(p), now: leadTypeOf(p) })),
    [prospects])

  /* ⚠️ ESC CLOSES WHATEVER IS OPEN, and a click outside closes the picker — the two ways out of a
   * menu somebody opened by mistake. The listener is registered once and reads the latest state. */
  const latest = useRef({ editing, infoFor })
  useEffect(() => { latest.current = { editing, infoFor } })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (latest.current.editing) setEditing(null)
      if (latest.current.infoFor) setInfoFor(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const say = (m: string) => { setSaved(m); window.setTimeout(() => setSaved(null), 2000) }

  const change = async (step: LadderKind, lead: string, value: string) => {
    const before = index.get(slotKey(channel, step, lead)) ?? null
    const label = `${STEP_LABELS[step]} · ${lead === ANY_LEAD ? 'All trucks' : name(lead as LeadType)}`
    setEditing(null)
    if (value === '') await onClearSlot(channel, step, lead)
    else await onSetSlot(channel, step, lead, value)
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
    <div className="flex flex-col gap-2">
      {/* ── 🔴 ONE AMBER LINE, NOT A PANEL ─────────────────────────────────────────────────────
          "Changed type since first email" was a standing block under the grid listing prospects. It
          is a thing to deal with occasionally, not a thing to read every time; it is one line when
          there is something to say and nothing at all when there is not. */}
      {changed.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5">
          <p className="text-[12px] text-amber-900 flex items-center gap-2 flex-wrap">
            <span>
              {changed.length} truck{changed.length === 1 ? '' : 's'} changed type since{' '}
              {changed.length === 1 ? 'its' : 'their'} first email
            </span>
            <button type="button" onClick={() => setReviewOpen(v => !v)}
              className="font-bold underline hover:no-underline">{reviewOpen ? 'Hide' : 'Review'}</button>
          </p>
          {reviewOpen && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {changed.map(c => (
                <li key={c.id} className="flex items-baseline gap-2 text-[12px] text-amber-900">
                  <span className="font-semibold">{c.name}</span>
                  <span>{name(c.was)} → {name(c.now)}</span>
                  <button type="button" onClick={() => onOpenProspect(c.id)}
                    className="ml-auto font-bold underline hover:no-underline">Open</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={`${CARD} p-3 flex flex-col gap-2`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-900">Who gets which template, and when</span>
          {saved && <span className="text-[11px] font-semibold text-emerald-700">{saved}</span>}
          {undo && (
            <button type="button" onClick={() => void undo.revert()} disabled={busy}
              className="text-[11px] font-semibold text-slate-600 underline hover:no-underline disabled:opacity-40">
              Undo {undo.label}
            </button>
          )}
          {/* ⚠️ TOP RIGHT, as it was. */}
          <div className="ml-auto flex items-center gap-1">
            {(['email', 'whatsapp'] as const).map(c => (
              <button key={c} type="button" onClick={() => { setChannel(c); setEditing(null) }} aria-pressed={channel === c}
                className={`text-xs font-bold px-2 py-1 rounded-lg border ${channel === c
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                {c === 'email' ? 'Email' : 'WhatsApp'}
              </button>
            ))}
          </div>
        </div>

        {!hasSequence && (
          <p className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
            The sequence grid needs <code>supabase/migrations/20260930_outreach_sequence_slots.sql</code> applying,
            and a PostgREST schema reload. Until then every box below is read-only and the composer
            pre-selects nothing.
          </p>
        )}

        {/* ⚠️ THE TABLE SCROLLS SIDEWAYS INSIDE ITS OWN BOX ON A PHONE, with the row labels pinned —
            `sticky left-0` on the first cell of every row. On a laptop it never needs to. */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-separate" style={{ borderSpacing: '6px' }}>
            <thead>
              <tr>
                <th className="text-left align-bottom sticky left-0 bg-white z-10" style={{ width: '13rem' }}>
                  <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400">Truck type</span>
                </th>
                {CONTACT_KINDS.map(step => (
                  <th key={step} className="text-left align-bottom" style={{ width: '15rem' }}>
                    <span className="block text-[12px] font-bold text-slate-800">{STEP_LABELS[step]}</span>
                    {/* 🔴 FROM `FOLLOW_UP_DAYS`, never a second table — see `stepOffsetLabel`. */}
                    <span className="block text-[10px] text-slate-400">{stepOffsetLabel(step, FOLLOW_UP_DAYS)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOT_LEAD_TYPES.map(lt => (
                <tr key={lt}>
                  <th className="text-left align-top sticky left-0 bg-white z-10">
                    <span className="block text-[12px] font-bold text-slate-700">
                      {lt === ANY_LEAD ? 'All trucks (default)' : name(lt as LeadType)}
                      {lt !== ANY_LEAD && (
                        <button type="button" onClick={() => setInfoFor(infoFor === lt ? null : (lt as LeadType))}
                          aria-label={`How ${name(lt as LeadType)} is decided`}
                          className="ml-1 text-[11px] font-bold text-slate-400 hover:text-slate-700">ⓘ</button>
                      )}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      {lt === ANY_LEAD
                        ? 'used when a type has none of its own'
                        : `${typeCounts.get(lt) ?? 0} truck${(typeCounts.get(lt) ?? 0) === 1 ? '' : 's'}`}
                    </span>
                    {/* ⚠️ `infoFor` IS A `LeadType`, so it can never equal the default row's key —
                        the comparison alone is the whole guard. */}
                    {infoFor !== null && infoFor === lt && (
                      <TypePopover type={lt as LeadType} label={name(lt as LeadType)}
                        count={typeCounts.get(lt) ?? 0} how={HOW_DECIDED[lt as LeadType]}
                        busy={busy} onRename={onRename} onClose={() => setInfoFor(null)} />
                    )}
                  </th>
                  {CONTACT_KINDS.map(step => {
                    const key = slotKey(channel, step, lt)
                    const own = index.get(key)
                    const ownTemplate = own ? templates.find(t => t.uuid === own.template_id) ?? null : null
                    const resolved = lt === ANY_LEAD ? null
                      : chooseTemplate({ slots: index, templates, channel, step, leadType: lt })
                    const inherited = !own && resolved?.slug ? resolved.label : null
                    const broken = !!ownTemplate && (!ownTemplate.active || ownTemplate.channel !== channel)
                    const due = counts.get(key) ?? 0
                    // 🔴 A GAP IS A BOX THAT WOULD SUGGEST NOTHING. An empty DEFAULT cell that every
                    // type covers for itself is not a gap — it is a decision — so it is grey.
                    const gap = (!own && !inherited) || broken
                    const matters = gap && (lt !== ANY_LEAD || due > 0)
                    return (
                      <td key={step} className="align-top">
                        <Cell
                          open={editing === key}
                          outlined={editing === key || highlight === key}
                          onOpen={() => setEditing(editing === key ? null : key)}
                          onClose={() => setEditing(null)}
                          disabled={!hasSequence || busy}
                          isDefaultRow={lt === ANY_LEAD}
                          template={ownTemplate}
                          inherited={inherited}
                          broken={broken}
                          matters={matters}
                          due={due}
                          options={ofChannel}
                          onChoose={v => void change(step, lt, v)}
                          onOpenTemplate={onOpenTemplate}
                          onNew={() => { setEditing(null); onNewTemplate(channel) }}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── THE KEY ──────────────────────────────────────────────────────────────────────────── */}
        <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><span className="font-semibold text-slate-700">Name</span> its own template</span>
          <span><span className="text-slate-500">↳ Name</span> uses the default</span>
          <span className="text-red-700 font-semibold">red = nothing will be suggested</span>
          <span><span className="font-semibold text-slate-700">n due</span> = trucks due at that box now</span>
        </p>
      </div>
    </div>
  )
}

/**
 * One box.
 * 🔴 IT READS UNTIL IT IS CLICKED. A `<select>` per box meant twenty controls open at once, each
 * showing a truncated value and none able to say "↳ inherited from the default" — which is the one
 * thing a reader of this grid most needs to know.
 */
function Cell({
  open, outlined, onOpen, onClose, disabled, isDefaultRow, template, inherited, broken, matters, due,
  options, onChoose, onOpenTemplate, onNew,
}: {
  open: boolean
  outlined: boolean
  onOpen: () => void
  onClose: () => void
  disabled: boolean
  isDefaultRow: boolean
  template: SlotTemplate | null
  inherited: string | null
  broken: boolean
  matters: boolean
  due: number
  options: readonly SlotTemplate[]
  onChoose: (templateId: string) => void
  onOpenTemplate: (uuid: string) => void
  onNew: () => void
}) {
  const border = matters ? 'border-red-300 bg-red-50'
    : inherited ? 'border-dashed border-slate-300 bg-slate-50'
      : template ? 'border-slate-200 bg-white' : 'border-slate-200 bg-white'
  return (
    <div className="relative">
      <button type="button" onClick={onOpen} disabled={disabled} aria-expanded={open}
        className={`w-full min-h-[3.25rem] text-left rounded-lg border px-2 py-1.5 disabled:opacity-50 ${border} ${
          outlined ? 'ring-2 ring-slate-800' : 'hover:bg-slate-50'}`}>
        {template && !broken ? (
          // ⚠️ `break-words`, NOT `truncate`: a template's name is the one thing in this cell that
          // must never be cut off, and two lines is what the row height allows for.
          <span className="flex items-start gap-1">
            <span className="text-[12px] font-semibold text-slate-900 break-words">{template.label}</span>
            <span role="button" tabIndex={0}
              onClick={e => { e.stopPropagation(); onOpenTemplate(template.uuid) }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onOpenTemplate(template.uuid) } }}
              title={`Open “${template.label}”`}
              className="ml-auto shrink-0 text-[11px] font-bold text-slate-400 hover:text-slate-800">↗</span>
          </span>
        ) : broken ? (
          <span className="text-[12px] font-semibold text-red-700 break-words">
            {template?.label} — retired
          </span>
        ) : inherited ? (
          <span className="text-[12px] text-slate-500 break-words">↳ {inherited}</span>
        ) : matters ? (
          <span className="text-[12px] font-semibold text-red-700">
            {isDefaultRow ? 'No template' : '↳ Nothing yet'}
          </span>
        ) : (
          // 🔴 A PLAIN GREY "None". An empty default cell that every type fills for itself is a
          // decision, not a gap, and red would train the eye to ignore red.
          <span className="text-[12px] text-slate-400">None</span>
        )}
      </button>

      {/* 🔴 ONLY ABOVE ZERO. A column of "0 due" is a column of noise. */}
      {due > 0 && (
        <span className={`absolute -top-1.5 right-1 text-[10px] font-bold px-1 py-px rounded border ${
          matters ? 'bg-red-100 border-red-300 text-red-800' : 'bg-slate-100 border-slate-300 text-slate-600'}`}>
          {due} due
        </span>
      )}

      {open && (
        <>
          {/* ⚠️ A CLICK ANYWHERE ELSE CLOSES IT WITHOUT CHANGING ANYTHING. */}
          <div className="fixed inset-0 z-20" onClick={onClose} role="presentation" />
          <div className="absolute z-30 mt-1 w-64 rounded-lg border border-slate-300 bg-white shadow-lg p-1 max-h-72 overflow-y-auto">
            <button type="button" onClick={() => onChoose('')}
              className="w-full text-left text-[12px] px-2 py-1 rounded hover:bg-slate-100">
              {isDefaultRow ? 'No template' : 'Same as default'}
            </button>
            <div className="my-1 border-t border-slate-100" />
            {options.map(t => (
              <button key={t.uuid} type="button" onClick={() => onChoose(t.uuid)}
                className="w-full text-left text-[12px] px-2 py-1 rounded hover:bg-slate-100">
                {t.label}
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            {/* ⚠️ IT CREATES NOTHING. It opens the Templates view with an empty form on this channel;
                the row exists only when Save is pressed. */}
            <button type="button" onClick={onNew}
              className="w-full text-left text-[12px] font-semibold px-2 py-1 rounded text-slate-700 hover:bg-slate-100">
              + Write a new one for this box
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** The ⓘ popover: how the type is decided, how many there are, and its name. */
function TypePopover({ type, label, count, how, busy, onRename, onClose }: {
  type: LeadType
  label: string
  count: number
  how: string
  busy: boolean
  onRename: (t: LeadType, label: string) => Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState(label)
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} role="presentation" />
      <div className="absolute z-30 mt-1 w-72 rounded-lg border border-slate-300 bg-white shadow-lg p-2 flex flex-col gap-1.5">
        <p className="text-[11px] text-slate-600">{how}</p>
        <p className="text-[11px] text-slate-400">{count} truck{count === 1 ? '' : 's'} today</p>
        <div className="flex items-center gap-1">
          <input value={text} onChange={e => setText(e.target.value)} maxLength={40}
            aria-label={`Rename ${label}`}
            className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2 py-1 text-[12px]" />
          <button type="button" disabled={busy}
            onClick={() => void onRename(type, text.trim()).then(onClose)}
            className="text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-800 bg-slate-800 text-white disabled:opacity-40">
            Rename
          </button>
        </div>
      </div>
    </>
  )
}
