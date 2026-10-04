'use client'
// components/manage/EventTypes.tsx — every screen event types has.
//
// ── 🔴 THREE EXPORTS, ONE FILE, AND THAT IS A MERGE DECISION ───────────────────────────────────────
// `EventTypesPanel` (the setup screen), `EventTypeSelect` (the Add event picker) and
// `EventTypeDashboardControl` (the live-event control) all live here so that every shared file gets a
// ONE-LINE mount and nothing else. `app/manage/[token]/page.tsx` differs by 4,961 lines between main
// and schedule-graphics (docs/event-types-investigation-report.md §8), and the Add event modal is the
// most-rewritten region of it — so anything this feature adds inside that file has to be a single line
// that survives being moved.
//
// ⚠️ THE PANEL IS NOT A SUB-TAB. Main's Schedule tab has no sub-tab bar; schedule-graphics adds one.
// So this opens as a full-screen panel from a button, which works either way, and promoting it to a
// third pill after the merge is one entry in `SCHEDULE_SECTIONS` plus the same one line.
//
// ── WHAT THIS BUILD SHOWS ─────────────────────────────────────────────────────────────────────────
// 🔴 ONLY THE SERVICE SECTION. The Main board also has PRICE, MENU, STOCK, DEALS and VISIBILITY
// columns; none of those is resolved by anything in this build, and drawing them would promise a truck
// behaviour the next order does not deliver. They arrive with their own stages.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Btn } from './primitives'
import {
  SERVICE_ROWS, TYPE_NAME_CHIPS, MAX_TYPE_NAME,
  colourFor, STANDARD_COLOUR, TYPE_INTERVAL_CHOICES,
  type EventType, type ServiceRow,
} from '@/lib/event-types/types'
import { summariseType, changedCount, SERVICE_ROW_COUNT, type TypeFor } from '@/lib/event-types/resolve'
import {
  OFFLINE_PROTECTION_MODES, OFFLINE_MODE_PAUSE_LABEL, OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL,
} from '@/lib/copy/offlineProtection'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** A type as the route returns it, with its upcoming count. */
export interface TypeRow extends EventType { upcoming: number }

/** Standard's own values, read from the truck and its vans. `perVan` ⇒ the vans disagree. */
export interface StandardValues {
  buzzer_prompt: { value: boolean; perVan: boolean }
  takes_cash: { value: boolean; perVan: boolean }
  order_ready: { value: boolean; perVan: boolean }
  collection_interval_mins: { value: number; perVan: boolean }
  /** The van switch and mode together — the modal shows offline protection as ONE row. */
  offline_protection: { enabled: boolean; mode: string; perVan: boolean }
}

const api = async (token: string, body: Record<string, unknown>) => {
  const r = await fetch('/api/event-types', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...body }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Something went wrong')
  return j
}

/**
 * What Standard reads as, for one row.
 *
 * 🔴 IT SHOWS STANDARD'S ACTUAL VALUE, NOT A DASH. "Same as Standard" is only useful information if
 * you can see what Standard IS without looking across the table — which is the whole reason the
 * columns sit side by side.
 * ⚠️ "Set per van" WHERE THE VANS DISAGREE. A truck with two vans configured differently has no single
 * Standard for that row, and printing one of them as "your normal setup" would be false.
 */
function standardText(row: ServiceRow, standard: StandardValues): string {
  if (row.id === 'collection_interval_mins') {
    const s = standard.collection_interval_mins
    return s.perVan ? 'Set per van' : `Every ${s.value} min`
  }
  if (row.id === 'offline_protection') {
    const s = standard.offline_protection
    if (s.perVan) return 'Set per van'
    if (!s.enabled) return 'Off'
    return s.mode === 'no_auto_accept' ? OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL : OFFLINE_MODE_PAUSE_LABEL
  }
  const s = standard[row.id as 'buzzer_prompt' | 'takes_cash' | 'order_ready']
  return s.perVan ? 'Set per van' : s.value ? 'On' : 'Off'
}

/** Does this type say anything of its own for this row? Drives the grey "same as Standard" look. */
function rowIsOwn(row: ServiceRow, type: TypeFor): boolean {
  return row.keys.some(k => {
    const v = (type as unknown as Record<string, unknown>)[k]
    return v !== null && v !== undefined
  })
}

/**
 * ── 🔴 THE OFFLINE DROPDOWN'S FOUR CHOICES ────────────────────────────────────────────────────────
 * Settings › Kitchen offers a SWITCH and then, when it is on, a MODE. One dropdown says the same
 * thing in one control, which is what the TypesModal board shows — and it is one row because a
 * three-row offline section inside a type column would dwarf every other setting.
 *
 * ⛔ THE AUTO-REJECT DELAY IS NOT OFFERED ON A TYPE, and that is a decision, not an omission. See
 * docs/event-types-stage2b-report.md: the only thing that acts on the delay is a plpgsql function
 * (`claim_order_for_auto_reject`, 20260819) which resolves it as
 * `coalesce(event_override, van)` and cannot read this resolver. Offering a delay here that the
 * rejecter ignores would be a setting that displays and does nothing — the exact failure the mode
 * chain in heartbeat-monitor was changed to avoid. The COLUMN exists so the later stage needs no
 * migration, and the per-event delay control on the dashboard still works, because the function does
 * read the event override.
 */
const OFFLINE_CHOICES = [
  { value: '', label: 'Same as Standard' },
  { value: 'off', label: 'Off' },
  ...OFFLINE_PROTECTION_MODES.map(m => ({ value: m.value as string, label: m.label })),
] as const

/** The dropdown's current value, from the type's two columns. */
function offlineValue(type: TypeFor): string {
  if (type.offline_protection === false) return 'off'
  if (type.offline_protection === true || type.offline_protection_mode) {
    return type.offline_protection_mode ?? 'pause'
  }
  return ''
}

/** What a dropdown choice writes to the type's two columns. */
function offlinePatch(value: string): Record<string, unknown> {
  if (value === '') return { offline_protection: null, offline_protection_mode: null }
  if (value === 'off') return { offline_protection: false, offline_protection_mode: null }
  return { offline_protection: true, offline_protection_mode: value }
}

const Dot = ({ colour }: { colour: string }) => (
  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colour }} aria-hidden="true" />
)


// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE MODAL (TypesModal board)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ── 🔴 A CENTRED MODAL, NOT A FULL-SCREEN PANEL, AND FIXED-WIDTH COLUMNS ──────────────────────────
// The first build made this a full-screen panel with `minmax(150px, 1fr)` columns, so every type
// column got narrower as types were added and the controls sat in the LABEL column, misaligned with
// the rows they belonged to.
//
// Three things follow from the board and all three are load-bearing:
//   1. THE MODAL IS ~1000px AND NEVER GROWS. A truck with nine types does not get a wider dialog.
//   2. EVERY TYPE COLUMN IS A FIXED 230px. So a column is the same size whatever else exists, and
//      when they no longer fit THE COLUMNS SCROLL SIDEWAYS inside the modal — the label column stays
//      put, because it is what tells you which row you are reading.
//   3. EVERY CONTROL IS IN ITS OWN TYPE'S COLUMN, on the row its name is on. Nothing is in the label
//      column.

export function EventTypesPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [types, setTypes] = useState<TypeRow[]>([])
  const [standard, setStandard] = useState<StandardValues | null>(null)
  const [readOnly, setReadOnly] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  /* 🔴 ON A PHONE, ONE COLUMN AT A TIME WITH A PICKER AT THE TOP. Three fixed 230px columns beside a
   * 200px label column cannot be read on a 390px screen, and shrinking them is what produced the
   * misalignment this rewrite exists to fix. `null` is Standard. */
  const [phoneType, setPhoneType] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api(token, { action: 'load' })
      setTypes((r.types ?? []) as TypeRow[])
      setStandard(r.standard ?? null)
      setReadOnly(r.readOnly === true)
      setUpgradeMessage(r.upgradeMessage ?? null)
      setMissingTable(r.missingTable === true)
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not load', bad: true }) }
    finally { setLoading(false) }
  }, [token])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const act = async (body: Record<string, unknown>, after?: () => void) => {
    setBusy(true); setMsg(null)
    try { await api(token, body); await load(); after?.() }
    catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not save', bad: true }) }
    finally { setBusy(false) }
  }

  const patch = (id: string, values: Record<string, unknown>) => act({ action: 'update', id, ...values })

  const move = (id: string, by: -1 | 1) => {
    const i = types.findIndex(t => t.id === id)
    const j = i + by
    if (i < 0 || j < 0 || j >= types.length) return
    const ids = types.map(t => t.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setMenuFor(null)
    return act({ action: 'reorder', ids })
  }

  const editable = !readOnly && !busy
  const typeById = useMemo(() => new Map(types.map(t => [t.id, t])), [types])
  const columns = useMemo(
    () => [{ id: null as string | null, name: 'Standard' }, ...types.map(t => ({ id: t.id, name: t.name }))],
    [types],
  )

  /* ⚠️ CLOSING THE ⋯ MENU ON ANY OUTSIDE CLICK. A menu that stays open while the operator clicks a
   * control in the next column would sit over the thing they are trying to change. */
  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuFor])

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* 🔴 ~1000px AND IT NEVER GROWS. `w-full max-w-[1000px]` with `max-h-[92vh]`, and the columns
        * scroll inside — not the dialog. */}
      <div role="dialog" aria-modal="true" aria-label="Event types"
        data-event-types-modal
        className="bg-white w-full max-w-[1000px] max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* ── HEADER ───────────────────────────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-slate-200">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-slate-900 text-lg">Event types</h2>
            <p className="text-xs sm:text-[13px] text-slate-500">
              Grey = same as Standard. Changes save as you go.
            </p>
          </div>
          <Btn label="+ New event type" colour="ghost" disabled={!editable}
            onClick={() => setCreating(true)} />
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-lg font-bold">✕</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && <p className="text-sm text-slate-400 p-5">Loading…</p>}

          {!loading && missingTable && (
            <div className="p-5">
              <p className="text-sm font-bold text-slate-800">Event types aren’t switched on yet.</p>
              <p className="text-sm text-slate-600 mt-1">
                The database update for this feature hasn’t been applied. Nothing is broken — every
                event is using your normal setup.
              </p>
            </div>
          )}

          {!loading && readOnly && (
            <div className="m-4 p-3 rounded-xl border border-amber-200 bg-amber-50">
              <p className="text-sm font-bold text-amber-900">{upgradeMessage ?? 'Event types are part of the Max plan.'}</p>
              <p className="text-sm text-amber-800 mt-1">
                Events that already have a type keep using it. To add, change or assign types, move to Max.
              </p>
            </div>
          )}

          {msg && (
            <p className={`m-4 text-sm rounded-xl px-3 py-2 border ${msg.bad
              ? 'text-red-700 bg-red-50 border-red-200'
              : 'text-slate-600 bg-slate-50 border-slate-200'}`}>{msg.text}</p>
          )}

          {!loading && !missingTable && standard && (
            <>
              {/* ── PHONE: a picker, then one column ──────────────────────────────────────────── */}
              <div className="md:hidden p-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="et-phone-pick">Event type</label>
                  <select id="et-phone-pick" value={phoneType ?? ''} onChange={e => setPhoneType(e.target.value || null)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white h-11">
                    {columns.map(c => <option key={c.id ?? 'standard'} value={c.id ?? ''}>{c.name}</option>)}
                  </select>
                </div>
                {phoneType === null
                  ? <StandardCard standard={standard} />
                  : (() => {
                      const t = typeById.get(phoneType)
                      if (!t) return <p className="text-sm text-slate-400">That type has gone.</p>
                      return (
                        <TypeCard
                          type={t} standard={standard} editable={editable}
                          colour={colourFor(types.findIndex(x => x.id === t.id))}
                          onPatch={v => void patch(t.id, v)}
                          onRename={() => { setRenaming(t.id); setRenameTo(t.name) }}
                          onDelete={() => setConfirmDelete(t.id)}
                        />
                      )
                    })()}
              </div>

              {/* ── TABLET AND UP: the fixed-width columns, scrolling sideways ────────────────── */}
              {/* ⚠️ THE SCROLLER IS THE ROW AREA, so the modal's own width never changes. */}
              <div className="hidden md:block overflow-x-auto px-2 pb-2" data-types-scroller>
                <div
                  className="min-w-max"
                  style={{ display: 'grid', gridTemplateColumns: `200px repeat(${types.length + 1}, 230px)` }}
                  data-types-grid
                >
                  {/* heading row */}
                  <div className="px-3.5 py-3" />
                  <div className="px-3.5 py-3 bg-slate-50 flex items-center gap-2 min-w-0">
                    <Dot colour={STANDARD_COLOUR} />
                    <span className="text-[15px] font-bold text-slate-800 truncate">Standard</span>
                    <span className="text-[11px] text-slate-400 font-semibold shrink-0">default</span>
                  </div>
                  {types.map((t, i) => (
                    <div key={t.id} className="px-3.5 py-3 flex items-center gap-2 min-w-0 relative">
                      <Dot colour={colourFor(i)} />
                      <span className="text-[15px] font-bold text-slate-800 truncate">{t.name}</span>
                      {/* 🔴 RENAME / MOVE / DELETE LIVE IN A ⋯ MENU, not as four links under every
                        * column. Four links per column is four links × nine types of chrome competing
                        * with the settings, which are what the screen is for. */}
                      <button type="button" aria-label={`More for ${t.name}`} disabled={!editable}
                        onClick={e => { e.stopPropagation(); setMenuFor(menuFor === t.id ? null : t.id) }}
                        className="ml-auto shrink-0 w-[30px] h-[30px] rounded-lg border border-slate-200 text-slate-500 font-bold disabled:text-slate-300">⋯</button>
                      {menuFor === t.id && (
                        <div className="absolute right-2 top-11 z-10 w-[170px] bg-white rounded-xl shadow-xl border border-slate-100 p-1.5 text-sm"
                          onClick={e => e.stopPropagation()}>
                          <button type="button" className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50"
                            onClick={() => { setRenaming(t.id); setRenameTo(t.name); setMenuFor(null) }}>Rename</button>
                          <button type="button" disabled={i === 0}
                            className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 disabled:text-slate-300"
                            onClick={() => void move(t.id, -1)}>Move left</button>
                          <button type="button" disabled={i === types.length - 1}
                            className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 disabled:text-slate-300"
                            onClick={() => void move(t.id, 1)}>Move right</button>
                          <button type="button" className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-red-700"
                            onClick={() => { setConfirmDelete(t.id); setMenuFor(null) }}>Delete</button>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="col-span-full px-3.5 pt-3.5 pb-1.5 text-[11px] font-bold text-slate-500 tracking-[0.06em]"
                    style={{ gridColumn: '1 / -1' }}>SERVICE</div>

                  {SERVICE_ROWS.map(row => (
                    <SettingRow key={row.id} row={row} types={types} standard={standard}
                      editable={editable} onPatch={patch} />
                  ))}

                  <div className="col-span-full px-3.5 pt-3.5 pb-1.5 text-[11px] font-bold text-slate-500 tracking-[0.06em]"
                    style={{ gridColumn: '1 / -1' }}>USED BY</div>
                  <div className="px-3.5 py-2.5 border-t border-slate-100 text-sm font-semibold text-slate-900 min-h-11 flex items-center">
                    Upcoming events
                  </div>
                  <div className="px-3.5 py-2.5 border-t border-slate-100 bg-slate-50 text-sm text-slate-600 min-h-11 flex items-center">
                    Everything else
                  </div>
                  {types.map(t => (
                    <div key={t.id} className="px-3.5 py-2.5 border-t border-slate-100 text-sm text-slate-700 min-h-11 flex items-center">
                      {t.upcoming} event{t.upcoming === 1 ? '' : 's'}
                    </div>
                  ))}
                </div>
              </div>

              {types.length === 0 && (
                <p className="px-5 pb-4 text-xs text-slate-500">
                  You have no event types yet, so every event uses your normal setup.
                </p>
              )}
            </>
          )}
        </div>

        {/* ── FOOTER ───────────────────────────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 text-[13px] text-slate-500">
          Standard is your normal setup. Change it in Settings. Anything you change on one event’s
          dashboard still wins.
        </div>
      </div>

      {/* ── + NEW EVENT TYPE (NewType2 board) ───────────────────────────────────────────────────── */}
      {creating && (
        <NewTypePopup
          busy={!editable}
          onCancel={() => setCreating(false)}
          onCreate={name => void act({ action: 'create', name }, () => setCreating(false))}
        />
      )}

      {/* ── RENAME ───────────────────────────────────────────────────────────────────────────── */}
      {renaming && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setRenaming(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <p className="font-bold text-slate-900">Rename this type</p>
            <input value={renameTo} onChange={e => setRenameTo(e.target.value)} maxLength={MAX_TYPE_NAME}
              aria-label="Type name"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white h-11" />
            <div className="flex gap-2 justify-end">
              <Btn label="Cancel" colour="slate" size="sm" onClick={() => setRenaming(null)} />
              <Btn label="Save" size="sm" disabled={!editable || !renameTo.trim()}
                onClick={() => void act({ action: 'update', id: renaming, name: renameTo }, () => setRenaming(null))} />
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE ───────────────────────────────────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <p className="font-bold text-slate-900">
              Delete “{typeById.get(confirmDelete)?.name ?? 'this type'}”?
            </p>
            {/* 🔴 IT SAYS WHAT HAPPENS TO THE EVENTS, because that is the only thing a truck needs to
              * know before pressing it. `on delete set null` is what makes it true. */}
            <p className="text-sm text-slate-600">
              Its {typeById.get(confirmDelete)?.upcoming ?? 0} upcoming event
              {(typeById.get(confirmDelete)?.upcoming ?? 0) === 1 ? '' : 's'} will go back to Standard.
              Anything you changed on a single event stays as it is.
            </p>
            <div className="flex gap-2 justify-end">
              <Btn label="Keep" colour="slate" size="sm" onClick={() => setConfirmDelete(null)} />
              <Btn label="Delete" colour="red" size="sm" disabled={!editable}
                onClick={() => void act({ action: 'delete', id: confirmDelete }, () => setConfirmDelete(null))} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1a · ONE ROW OF THE GRID
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The label, then Standard's value, then one control PER TYPE IN THAT TYPE'S OWN COLUMN.
 *
 * 🔴 NOTHING GOES IN THE LABEL COLUMN. The first build put the controls there, so a row read
 * "Buzzers [switch] | On | On | Off" and the switch belonged to no column at all.
 */
function SettingRow({ row, types, standard, editable, onPatch }: {
  row: ServiceRow
  types: TypeRow[]
  standard: StandardValues
  editable: boolean
  onPatch: (id: string, values: Record<string, unknown>) => void
}) {
  return (
    <>
      <div className="px-3.5 py-2.5 border-t border-slate-100 text-sm font-semibold text-slate-900 min-h-11 flex items-center">
        {row.label}
      </div>
      {/* 🔴 STANDARD IS READ-ONLY. Its values live on the truck and the vans, and editing them from
        * here would be a second route to Settings that could disagree with it. */}
      <div className="px-3.5 py-2.5 border-t border-slate-100 bg-slate-50 text-sm text-slate-600 min-h-11 flex items-center">
        {standardText(row, standard)}
      </div>
      {types.map(t => (
        <div key={t.id} className="px-3.5 py-2.5 border-t border-slate-100 min-h-11 flex items-center gap-2">
          <TypeControl row={row} type={t} editable={editable} onPatch={v => onPatch(t.id, v)} />
        </div>
      ))}
    </>
  )
}

/**
 * One type's control for one row.
 *
 * ── 🔴 "SAME AS STANDARD" IS A REAL STATE, AND IT LOOKS LIKE ONE ─────────────────────────────────
 * For a DROPDOWN it is the first option, so it needs no extra affordance.
 * For a SWITCH there is no third position, so: a GREYED switch labelled "Same as Standard", and
 * tapping it sets an explicit On/Off. Once explicit, a small "Same as Standard" link beside the value
 * puts it back to NULL — without that link a truck could set a switch and never get back to
 * inheriting, which is the state they started in.
 */
function TypeControl({ row, type, editable, onPatch }: {
  row: ServiceRow
  type: TypeRow
  editable: boolean
  onPatch: (values: Record<string, unknown>) => void
}) {
  const own = rowIsOwn(row, type)

  if (row.kind === 'interval') {
    return (
      <select
        aria-label={`${row.label} for ${type.name}`}
        value={type.collection_interval_mins ?? ''}
        disabled={!editable}
        onChange={e => onPatch({ collection_interval_mins: e.target.value === '' ? null : Number(e.target.value) })}
        className={`w-full border rounded-lg px-2.5 h-9 text-[13px] font-semibold bg-white ${own
          ? 'border-slate-300 text-slate-900' : 'border-slate-200 text-slate-400'}`}>
        <option value="">Same as Standard</option>
        {TYPE_INTERVAL_CHOICES.map(n => <option key={n} value={n}>Every {n} min</option>)}
      </select>
    )
  }

  if (row.kind === 'offline') {
    return (
      <select
        aria-label={`${row.label} for ${type.name}`}
        value={offlineValue(type)}
        disabled={!editable}
        onChange={e => onPatch(offlinePatch(e.target.value))}
        className={`w-full border rounded-lg px-2.5 h-9 text-[13px] font-semibold bg-white ${own
          ? 'border-slate-300 text-slate-900' : 'border-slate-200 text-slate-400'}`}>
        {OFFLINE_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    )
  }

  // ── A SWITCH ──────────────────────────────────────────────────────────────────────────────────
  const key = row.keys[0]
  const value = (type as unknown as Record<string, unknown>)[key] as boolean | null | undefined
  const explicit = value === true || value === false

  return (
    <>
      <button type="button" role="switch" aria-checked={value === true} disabled={!editable}
        aria-label={`${row.label} for ${type.name}`}
        /* ⚠️ TAPPING AN INHERITING SWITCH SETS AN EXPLICIT VALUE, and the value it sets is the
         * OPPOSITE of what it is showing — which is what a switch does. An inheriting switch shows
         * Standard's position greyed; tapping it means "no, for this type, the other one". */
        onClick={() => onPatch({ [key]: explicit ? !value : true })}
        className={`relative w-[42px] h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
          value === true ? 'bg-orange-600' : 'bg-slate-300'} ${explicit ? '' : 'opacity-45'}`}>
        <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
          value === true ? 'translate-x-[21px]' : 'translate-x-[3px]'}`} />
      </button>
      {explicit ? (
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-slate-900">{value ? 'On' : 'Off'}</span>
          {/* 🔴 THE WAY BACK TO NULL. Without it a switch is a one-way door out of inheriting. */}
          <button type="button" disabled={!editable} onClick={() => onPatch({ [key]: null })}
            className="text-[11px] text-slate-400 underline hover:text-slate-600 disabled:text-slate-300 truncate">
            Same as Standard
          </button>
        </span>
      ) : (
        <span className="text-xs text-slate-400 truncate">Same as Standard</span>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1b · THE PHONE CARDS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Standard on a phone. Read-only, and it says why. */
function StandardCard({ standard }: { standard: StandardValues }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Dot colour={STANDARD_COLOUR} />
        <p className="font-bold text-slate-900">Standard</p>
        <span className="text-xs text-slate-400">default</span>
      </div>
      <p className="text-xs text-slate-500">Your normal setup — used at every event with no type.</p>
      {SERVICE_ROWS.map(row => (
        <div key={row.id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-t border-slate-100">
          <span className="text-slate-700">{row.label}</span>
          <span className="text-slate-600 text-right">{standardText(row, standard)}</span>
        </div>
      ))}
      <p className="text-xs text-slate-400">Change these in Settings, not here.</p>
    </div>
  )
}

/** One type on a phone. The same controls, stacked. */
function TypeCard({ type, standard, editable, colour, onPatch, onRename, onDelete }: {
  type: TypeRow
  standard: StandardValues
  editable: boolean
  colour: string
  onPatch: (values: Record<string, unknown>) => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Dot colour={colour} />
        <p className="font-bold text-slate-900 min-w-0 flex-1 truncate">{type.name}</p>
        <button type="button" onClick={onRename} disabled={!editable}
          className="text-xs font-bold text-slate-600 disabled:text-slate-300">Rename</button>
        <button type="button" onClick={onDelete} disabled={!editable}
          className="text-xs font-bold text-red-600 disabled:text-slate-300">Delete</button>
      </div>
      <p className="text-xs text-slate-500">
        {type.upcoming} upcoming event{type.upcoming === 1 ? '' : 's'} ·{' '}
        {changedCount(type) === 0 ? 'nothing changed yet' : `${changedCount(type)} of ${SERVICE_ROW_COUNT} changed`}
      </p>
      {SERVICE_ROWS.map(row => (
        <div key={row.id} className="py-1.5 border-t border-slate-100">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-slate-600">{row.label}</span>
            <span className="text-[11px] text-slate-400">Standard: {standardText(row, standard)}</span>
          </div>
          <div className="flex items-center gap-2">
            <TypeControl row={row} type={type} editable={editable} onPatch={onPatch} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · NEW EVENT TYPE (NewType2 board)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A name field and four name chips. Nothing else.
 *
 * ── 🔴 THE CHIPS FILL THE NAME AND DO NOTHING ELSE ────────────────────────────────────────────────
 * The first build's chips were SUGGESTIONS that pre-filled settings. Two trucks tapping "Festival"
 * got three settings already changed, chosen for them, with nothing afterwards saying which three —
 * so the first thing they had to do was work out what to undo. Every new type now starts with every
 * setting NULL, whichever chip was tapped, and the line under the chips says so.
 */
function NewTypePopup({ busy, onCancel, onCreate }: {
  busy: boolean
  onCancel: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-label="New event type" data-new-type-popup
        className="bg-white rounded-2xl w-full max-w-[460px] p-5 flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <p className="font-bold text-slate-900 text-lg flex-1">New event type</p>
          <button type="button" onClick={onCancel} aria-label="Close"
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 font-bold">✕</button>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-slate-700 mb-1.5" htmlFor="et-new-name">Name</label>
          <input id="et-new-name" ref={inputRef} value={name} maxLength={MAX_TYPE_NAME}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. School fete"
            className="w-full border border-slate-300 rounded-xl px-3 h-11 text-[15px] text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>

        <div className="flex flex-wrap gap-2">
          {TYPE_NAME_CHIPS.map(chip => (
            /* ⚠️ A CHIP SETS THE NAME FIELD, which stays editable — so "Festival" can become
             * "Festival (Saturday)" without retyping it. */
            <button key={chip} type="button" onClick={() => { setName(chip); inputRef.current?.focus() }}
              className="border border-slate-300 rounded-full px-3.5 h-10 text-sm font-semibold text-slate-900 bg-white hover:bg-slate-50">
              {chip}
            </button>
          ))}
        </div>

        <p className="text-[13px] text-slate-500">
          Tap a name or type your own. It starts exactly like Standard. Change anything after.
        </p>

        <div className="flex gap-2.5 justify-end">
          <Btn label="Cancel" colour="slate" onClick={onCancel} />
          <Btn label="Create" disabled={busy || !name.trim()} onClick={() => onCreate(name)} />
        </div>
      </div>
    </div>
  )
}
// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE ADD EVENT PICKER — one <select>, from the AddEventType board
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The "Event type" field in the Add event modal.
 *
 * 🔴 ONE MOUNT, ONE LINE, AND THAT IS THE POINT. `app/manage/[token]/page.tsx` is rewritten on
 * schedule-graphics, and the Add event modal is its most-changed region; everything this field needs —
 * loading the types, finding the usual one for the venue, the hint, the summary — is inside this
 * component, so the modal gains a single element.
 *
 * ⚠️ IT OWNS NO FORM STATE. `value` and `onChange` come from the modal, so the type is submitted by
 * the same save the rest of the form uses and there is no second write path to keep in step.
 */
export function EventTypeSelect({ token, venueName, value, onChange, disabled }: {
  token: string
  /** The venue typed into the form, for "the usual type for this place". */
  venueName: string | null | undefined
  value: string | null
  onChange: (typeId: string | null) => void
  disabled?: boolean
}) {
  const [types, setTypes] = useState<TypeRow[]>([])
  const [ready, setReady] = useState(false)
  const [usual, setUsual] = useState<string | null>(null)
  /* 🔴 THE DEFAULT IS APPLIED ONCE, AND ONLY WHILE THE FIELD IS UNTOUCHED. A truck who deliberately
   * chose Standard for a festival must not have the usual type put back by a later keystroke in the
   * venue box. */
  const touched = useRef(false)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const r = await api(token, { action: 'load' })
        if (live) setTypes((r.types ?? []) as TypeRow[])
      } catch { /* no types is the right answer on a failure: the field shows Standard only */ }
      finally { if (live) setReady(true) }
    })()
    return () => { live = false }
  }, [token])

  /* The usual type for this venue, debounced — it is a database read per venue name. */
  useEffect(() => {
    const name = String(venueName ?? '').trim()
    /* ⚠️ THE DISABLE IS ON THIS LINE, NOT ON THE TIMER BELOW. Clearing the remembered answer the moment
     * the venue box is emptied is the correct behaviour — a stale "usual for this place" hint under a
     * blank venue would be wrong — and it is a synchronous setState in an effect, which is what the
     * rule flags. The debounced write inside the timer is asynchronous and needs no disable. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!name || types.length === 0) { setUsual(null); return }
    const t = setTimeout(async () => {
      try {
        const r = await api(token, { action: 'usual_for_venue', venueName: name })
        setUsual((r.typeId as string | null) ?? null)
      } catch { setUsual(null) }
    }, 350)
    return () => clearTimeout(t)
  }, [token, venueName, types.length])

  /* ⚠️ THE DEFAULT IS APPLIED IN AN EFFECT because it depends on a read that finishes later. It fires
   * only while untouched and only when it would actually change the value. */
  useEffect(() => {
    if (touched.current || !usual || value) return
    onChange(usual)
  }, [usual, value, onChange])

  /* 🔴 NOTHING IS DRAWN FOR A TRUCK WITH NO TYPES. A field offering one option is a field that teaches
   * nothing and takes a row of the form — and a truck who has never made a type should not meet the
   * feature inside the Add event modal. */
  if (!ready || types.length === 0) return null

  const selected = types.find(t => t.id === value) ?? null
  const isUsual = !!usual && usual === (value ?? null)

  return (
    <div data-event-type-select>
      <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="event-type-select">Event type</label>
      <select id="event-type-select" value={value ?? ''} disabled={disabled}
        onChange={e => { touched.current = true; onChange(e.target.value || null) }}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
        <option value="">Standard</option>
        {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {/* The "(usual for this place)" hint, and a one-line summary of what the type changes. */}
      <p className="text-xs text-slate-500 mt-0.5">
        {isUsual && <span className="font-semibold text-slate-600">(usual for this place) </span>}
        {summariseType(selected)}
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE DASHBOARD CONTROL — from the Dashboard board
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Which of this event's settings are the truck's own hand changes, as /api/dashboard reports them. */
export interface OwnSettings {
  buzzer_prompt: boolean
  takes_cash: boolean
  order_ready: boolean
  collection_interval_mins: boolean
}

/**
 * "Event type ▾" on a live event, with the confirm from decision 3.
 *
 * 🔴 A LIVE EVENT'S TYPE CAN BE SWITCHED, and the confirm is what makes that safe to offer: it lists
 * what changes, says orders already placed keep their prices, and says the truck's own changes for this
 * event stay. All three are true of the implementation — the first because the resolvers are read at
 * request time, the second because price-lock is the stored `orders.items[].unit_price`
 * (lib/order-repricing.ts:4-12) and nothing here touches the orders table, the third because a hand
 * change outranks the type in every resolver.
 */
export function EventTypeDashboardControl({ token, eventId, currentTypeId, ownSettings, onChanged, disabled }: {
  token: string
  eventId: string
  currentTypeId: string | null
  ownSettings: OwnSettings | null
  onChanged: () => void
  disabled?: boolean
}) {
  const [types, setTypes] = useState<TypeRow[]>([])
  const [pending, setPending] = useState<string | null | undefined>(undefined)
  const [clearOwn, setClearOwn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const r = await api(token, { action: 'load' })
        if (live) setTypes((r.types ?? []) as TypeRow[])
      } catch { /* the control simply does not appear */ }
    })()
    return () => { live = false }
  }, [token])

  const ownCount = ownSettings
    ? Object.values(ownSettings).filter(Boolean).length
    : 0

  if (types.length === 0) return null

  const current = types.find(t => t.id === currentTypeId) ?? null
  const target = pending === undefined ? null : types.find(t => t.id === pending) ?? null
  const targetName = pending === undefined ? '' : (target?.name ?? 'Standard')

  const commit = async () => {
    setBusy(true); setErr(null)
    try {
      await api(token, { action: 'assign', eventId, typeId: pending ?? null, clearOwn })
      setPending(undefined); setClearOwn(false)
      onChanged()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not switch') }
    finally { setBusy(false) }
  }

  return (
    <div data-event-type-dashboard>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700 flex-1">Event type</span>
        <select
          aria-label="Event type"
          value={currentTypeId ?? ''}
          disabled={disabled || busy}
          onChange={e => { setClearOwn(false); setPending(e.target.value || null) }}
          /* 🔴 `h-10`, NOT `min-h-[40px]`, AND THE REASON IS SAFARI. WebKit does not apply `min-height`
           * to a `<select>` — it sizes the control from its own appearance — so the same class that
           * rendered 40px in Chromium rendered 23px in WebKit. Measured in both engines by
           * scripts/event-types-render.cjs, which is how it was found. An operator taps this on an
           * iPad mid-service; 23px is not a target. A fixed height is honoured by both. */
          className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm font-semibold text-slate-900 bg-white h-10">
          <option value="">Standard</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {ownCount > 0 && (
        <p className="text-xs text-slate-500 mt-1">
          {ownCount} setting{ownCount === 1 ? '' : 's'} changed for this event only.
        </p>
      )}

      {pending !== undefined && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
          onClick={() => { if (!busy) setPending(undefined) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-slate-900 text-lg">
              Switch this event to {targetName}?
            </p>
            {/* 🔴 THE THREE LINES FROM THE BOARD, AND EVERY ONE OF THEM IS TRUE OF THIS BUILD. */}
            <div className="text-sm text-slate-700 space-y-1">
              <p>• New orders use {targetName}’s service settings.</p>
              {/* ⚠️ SAID EVEN THOUGH THIS BUILD CHANGES NO PRICES, because it is the question a truck
                * asks when switching a LIVE event's type, and the answer will still be yes in stage 6.
                * It is true now by construction: nothing here writes to the orders table. */}
              <p>• Orders already placed keep their prices.</p>
              <p>
                {ownCount > 0
                  ? `• Your ${ownCount} change${ownCount === 1 ? '' : 's'} for this event stay.`
                  : '• You haven’t changed anything on this event.'}
              </p>
            </div>
            {ownCount > 0 && (
              <label className="flex gap-2 items-start text-sm text-slate-700">
                <input type="checkbox" checked={clearOwn} onChange={e => setClearOwn(e.target.checked)} className="mt-0.5" />
                <span>Clear my changes and use {targetName} exactly</span>
              </label>
            )}
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex gap-2 justify-end">
              <Btn label="Cancel" colour="slate" size="sm" disabled={busy} onClick={() => setPending(undefined)} />
              <Btn label={`Switch to ${targetName}`} size="sm" loading={busy} onClick={() => void commit()} />
            </div>
          </div>
        </div>
      )}
      {current && ownCount === 0 && (
        <p className="sr-only">This event uses {current.name} exactly.</p>
      )}
    </div>
  )
}
