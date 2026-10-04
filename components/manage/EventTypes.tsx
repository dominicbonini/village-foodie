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
import { Btn, Card } from './primitives'
import {
  SERVICE_KEYS, SERVICE_LABELS, TYPE_SUGGESTIONS, MAX_TYPE_NAME,
  colourFor, STANDARD_COLOUR, TYPE_INTERVAL_CHOICES,
  type EventType, type ServiceKey,
} from '@/lib/event-types/types'
import { summariseType, changedCount, type TypeFor } from '@/lib/event-types/resolve'

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
 * What one setting reads as, on one type.
 *
 * 🔴 GREY MEANS "SAME AS STANDARD", which is the Main board's `.std` class and the one piece of
 * information the side-by-side layout exists to convey: a truck scanning a column wants to see at a
 * glance what this type actually changes. The grey value is STANDARD'S value, not a dash — "the same
 * as Standard" is only useful if you can see what that is without looking across.
 */
function settingText(key: ServiceKey, type: TypeFor, standard: StandardValues): { text: string; own: boolean } {
  const v = type[key]
  if (v === null || v === undefined) {
    const s = standard[key]
    if (s.perVan) return { text: 'Set per van', own: false }
    return {
      text: key === 'collection_interval_mins'
        ? `Every ${standard.collection_interval_mins.value} min`
        : (s.value as boolean) ? 'On' : 'Off',
      own: false,
    }
  }
  return {
    text: key === 'collection_interval_mins' ? `Every ${v as number} min` : (v as boolean) ? 'On' : 'Off',
    own: true,
  }
}

const Dot = ({ colour }: { colour: string }) => (
  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colour }} aria-hidden="true" />
)

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE SETUP PANEL
// ════════════════════════════════════════════════════════════════════════════════════════════════

export function EventTypesPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [types, setTypes] = useState<TypeRow[]>([])
  const [standard, setStandard] = useState<StandardValues | null>(null)
  const [readOnly, setReadOnly] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [customName, setCustomName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  /* 🔴 ON A PHONE, ONE COLUMN AT A TIME WITH A PICKER AT THE TOP. Five columns side by side on a 390px
   * screen is five unreadable columns; the brief's instruction, and the same answer the weekly-post
   * setup reached for its own three-column grid. `null` is Standard. */
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

  const setValue = (id: string, key: ServiceKey, value: boolean | number | null) =>
    act({ action: 'update', id, [key]: value })

  const move = (id: string, by: -1 | 1) => {
    const i = types.findIndex(t => t.id === id)
    const j = i + by
    if (i < 0 || j < 0 || j >= types.length) return
    const ids = types.map(t => t.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    return act({ action: 'reorder', ids })
  }

  const editable = !readOnly && !busy

  /* The columns, Standard first. Standard is not a row in the table — it is the absence of a type —
   * so it is built here rather than fetched as one. */
  const columns = useMemo(
    () => [{ id: null as string | null, name: 'Standard' }, ...types.map(t => ({ id: t.id, name: t.name }))],
    [types],
  )
  const typeById = useMemo(() => new Map(types.map(t => [t.id, t])), [types])

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Event types">
      {/* ── HEADER ─────────────────────────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-black text-slate-900">Event types</h2>
          <p className="text-xs text-slate-500 truncate">
            Each column is an event type. Grey = same as Standard.
          </p>
        </div>
        <Btn label="Done" colour="slate" onClick={onClose} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
        {loading && <p className="text-sm text-slate-400">Loading…</p>}

        {/* 🔴 THE MIGRATION HAS NOT BEEN APPLIED. Said plainly rather than showing an empty screen that
          * looks like "you have no types" — the two are completely different problems. */}
        {!loading && missingTable && (
          <Card className="p-4">
            <p className="text-sm font-bold text-slate-800">Event types aren’t switched on yet.</p>
            <p className="text-sm text-slate-600 mt-1">
              The database update for this feature hasn’t been applied. Nothing is broken — every event
              is using your normal setup.
            </p>
          </Card>
        )}

        {/* The upgrade line, per decision 4: existing types keep working, nothing can be changed. */}
        {!loading && readOnly && (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <p className="text-sm font-bold text-amber-900">{upgradeMessage ?? 'Event types are part of the Max plan.'}</p>
            <p className="text-sm text-amber-800 mt-1">
              Events that already have a type keep using it. To add, change or assign types, move to Max.
            </p>
          </Card>
        )}

        {msg && (
          <p className={`text-sm rounded-xl px-3 py-2 border ${msg.bad
            ? 'text-red-700 bg-red-50 border-red-200'
            : 'text-slate-600 bg-slate-50 border-slate-200'}`}>{msg.text}</p>
        )}

        {!loading && !missingTable && standard && (
          <>
            {/* ── PHONE: a picker, then one column ────────────────────────────────────────────── */}
            <div className="md:hidden space-y-3">
              <Card className="p-3">
                <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="et-phone-pick">Event type</label>
                <select id="et-phone-pick" value={phoneType ?? ''} onChange={e => setPhoneType(e.target.value || null)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white h-11">
                  {columns.map(c => <option key={c.id ?? 'standard'} value={c.id ?? ''}>{c.name}</option>)}
                </select>
              </Card>
              {phoneType === null
                ? <StandardCard standard={standard} />
                : (() => {
                    const t = typeById.get(phoneType)
                    if (!t) return <p className="text-sm text-slate-400">That type has gone.</p>
                    return (
                      <TypeCard
                        type={t} standard={standard} editable={editable}
                        colour={colourFor(types.findIndex(x => x.id === t.id))}
                        onValue={(k, v) => void setValue(t.id, k, v)}
                        onRename={() => { setRenaming(t.id); setRenameTo(t.name) }}
                        onDelete={() => setConfirmDelete(t.id)}
                      />
                    )
                  })()}
            </div>

            {/* ── TABLET AND UP: the side-by-side grid, from the Main board ───────────────────── */}
            {/* ⚠️ THE WHOLE GRID SCROLLS SIDEWAYS IN ITS OWN BOX rather than squeezing the columns.
              * A truck with six types has a grid wider than 1440; letting the page scroll sideways
              * instead would take the Done button with it. */}
            <div className="hidden md:block overflow-x-auto">
              <div className="min-w-max">
                <div
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
                  style={{ display: 'grid', gridTemplateColumns: `200px repeat(${columns.length}, minmax(150px, 1fr))` }}
                  data-event-types-grid
                >
                  {/* heading row */}
                  <div className="bg-slate-50 px-3 py-2" />
                  {columns.map((c, i) => (
                    <div key={c.id ?? 'standard'} className="bg-slate-50 px-3 py-2 border-l border-slate-100 flex items-center gap-2 min-w-0">
                      <Dot colour={c.id === null ? STANDARD_COLOUR : colourFor(i - 1)} />
                      <span className="text-sm font-bold text-slate-800 truncate">{c.name}</span>
                      {c.id === null && <span className="text-[11px] text-slate-400 font-medium shrink-0">default</span>}
                    </div>
                  ))}

                  {/* what each type changes */}
                  <div className="px-3 py-2 border-t border-slate-100 text-sm font-bold text-slate-700">Changes</div>
                  <div className="px-3 py-2 border-t border-l border-slate-100 text-xs text-slate-500">Your normal setup</div>
                  {types.map(t => (
                    <div key={t.id} className="px-3 py-2 border-t border-l border-slate-100 text-xs text-slate-500">
                      {changedCount(t) === 0 ? 'Nothing yet' : `${changedCount(t)} of 4 service settings`}
                    </div>
                  ))}

                  {/* the SERVICE section — the only one this build resolves */}
                  <div className="col-span-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 tracking-wider">SERVICE</div>
                  {SERVICE_KEYS.map(key => (
                    <SettingRow
                      key={key} settingKey={key} types={types} standard={standard} editable={editable}
                      onValue={(id, v) => void setValue(id, key, v)}
                    />
                  ))}

                  {/* used by */}
                  <div className="px-3 py-2 border-t border-slate-100 text-sm font-bold text-slate-700">Used by</div>
                  <div className="px-3 py-2 border-t border-l border-slate-100 text-xs text-slate-500">Everything else</div>
                  {types.map(t => (
                    <div key={t.id} className="px-3 py-2 border-t border-l border-slate-100 text-xs text-slate-500">
                      {t.upcoming} upcoming event{t.upcoming === 1 ? '' : 's'}
                    </div>
                  ))}

                  {/* rename / reorder / delete */}
                  <div className="px-3 py-2 border-t border-slate-100" />
                  <div className="px-3 py-2 border-t border-l border-slate-100 text-xs text-slate-400">Can’t be changed</div>
                  {types.map((t, i) => (
                    <div key={t.id} className="px-3 py-2 border-t border-l border-slate-100 flex flex-wrap gap-2">
                      <button type="button" disabled={!editable} onClick={() => { setRenaming(t.id); setRenameTo(t.name) }}
                        className="text-xs font-bold text-slate-600 disabled:text-slate-300">Rename</button>
                      <button type="button" disabled={!editable || i === 0} onClick={() => void move(t.id, -1)}
                        aria-label={`Move ${t.name} left`}
                        className="text-xs font-bold text-slate-600 disabled:text-slate-300">←</button>
                      <button type="button" disabled={!editable || i === types.length - 1} onClick={() => void move(t.id, 1)}
                        aria-label={`Move ${t.name} right`}
                        className="text-xs font-bold text-slate-600 disabled:text-slate-300">→</button>
                      <button type="button" disabled={!editable} onClick={() => setConfirmDelete(t.id)}
                        className="text-xs font-bold text-red-600 disabled:text-slate-300">Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Btn label="+ New event type" disabled={!editable}
                onClick={() => { setPicking(true); setCustomName('') }} />
              {types.length === 0 && (
                <p className="text-xs text-slate-500">
                  You have no event types yet, so every event uses your normal setup.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── + NEW EVENT TYPE — the NewType board ─────────────────────────────────────────────── */}
      {picking && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setPicking(false)}>
          <div className="bg-slate-50 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="p-4 flex items-center gap-3">
              <p className="font-bold text-slate-900 text-lg flex-1">New event type</p>
              <button type="button" onClick={() => setPicking(false)} aria-label="Close"
                className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 font-bold">✕</button>
            </div>
            <div className="px-4 pb-2 text-[11px] font-bold text-slate-500 tracking-wider">SUGGESTIONS</div>
            <div className="overflow-y-auto px-4 space-y-2">
              {TYPE_SUGGESTIONS.map(sug => (
                <div key={sug.name} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{sug.name}</p>
                    {/* ⚠️ THE DESCRIPTION NAMES ONLY WHAT THIS BUILD DOES. The board's Festival line
                      * reads "Shorter menu, prices up, buzzers on"; menus and prices are later stages,
                      * so saying so now would be a promise the next order breaks. */}
                    <p className="text-xs text-slate-500">{sug.description}</p>
                  </div>
                  <Btn label="Add" colour="slate" size="sm" disabled={!editable}
                    onClick={() => void act({ action: 'create', name: sug.name, values: sug.values }, () => setPicking(false))} />
                </div>
              ))}
            </div>
            <div className="px-4 pt-3 pb-1 text-[11px] font-bold text-slate-500 tracking-wider">OR YOUR OWN</div>
            <div className="px-4 pb-4 space-y-2">
              <div className="flex gap-2">
                <input value={customName} onChange={e => setCustomName(e.target.value)} maxLength={MAX_TYPE_NAME}
                  placeholder="e.g. School fete" aria-label="New event type name"
                  className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
                <Btn label="Create" disabled={!editable || !customName.trim()}
                  onClick={() => void act({ action: 'create', name: customName }, () => setPicking(false))} />
              </div>
              <p className="text-xs text-slate-500">
                New types start as a copy of Standard. Change anything after.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── RENAME ───────────────────────────────────────────────────────────────────────────── */}
      {renaming && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setRenaming(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-slate-900">Rename this type</p>
            <input value={renameTo} onChange={e => setRenameTo(e.target.value)} maxLength={MAX_TYPE_NAME}
              aria-label="Type name"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
            <div className="flex gap-2 justify-end">
              <Btn label="Cancel" colour="slate" size="sm" onClick={() => setRenaming(null)} />
              <Btn label="Save" size="sm" disabled={!editable || !renameTo.trim()}
                onClick={() => void act({ action: 'update', id: renaming, name: renameTo }, () => setRenaming(null))} />
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE, WITH THE CONFIRM THAT SAYS WHAT HAPPENS TO ITS EVENTS ────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
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

/** One row of the grid: the label, Standard's value, then each type's. */
function SettingRow({ settingKey, types, standard, editable, onValue }: {
  settingKey: ServiceKey
  types: TypeRow[]
  standard: StandardValues
  editable: boolean
  onValue: (id: string, v: boolean | number | null) => void
}) {
  const std = standard[settingKey]
  return (
    <>
      <div className="px-3 py-2 border-t border-slate-100 text-sm text-slate-700">{SERVICE_LABELS[settingKey]}</div>
      {/* 🔴 STANDARD IS READ-ONLY HERE. Its values live on the truck and the vans, and editing them
        * from this screen would be a second route to Settings that could disagree with it. */}
      <div className="px-3 py-2 border-t border-l border-slate-100 text-sm text-slate-700">
        {std.perVan
          ? <span className="text-slate-500">Set per van</span>
          : settingKey === 'collection_interval_mins'
            ? `Every ${standard.collection_interval_mins.value} min`
            : (std.value as boolean) ? 'On' : 'Off'}
      </div>
      {types.map(t => {
        const { own } = settingText(settingKey, t, standard)
        return (
          <div key={t.id} className="px-3 py-2 border-t border-l border-slate-100">
            {settingKey === 'collection_interval_mins' ? (
              <select
                aria-label={`${SERVICE_LABELS[settingKey]} for ${t.name}`}
                value={t.collection_interval_mins ?? ''}
                disabled={!editable}
                onChange={e => onValue(t.id, e.target.value === '' ? null : Number(e.target.value))}
                /* ⚠️ GREY WHEN IT MATCHES STANDARD — the `.std` treatment from the board, applied to a
                 * real control rather than to text, so it can be both seen and changed. */
                className={`w-full border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white ${own ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                <option value="">Same as Standard</option>
                {TYPE_INTERVAL_CHOICES.map(n => <option key={n} value={n}>Every {n} min</option>)}
              </select>
            ) : (
              <select
                aria-label={`${SERVICE_LABELS[settingKey]} for ${t.name}`}
                value={t[settingKey] === null || t[settingKey] === undefined ? '' : (t[settingKey] ? 'on' : 'off')}
                disabled={!editable}
                onChange={e => onValue(t.id, e.target.value === '' ? null : e.target.value === 'on')}
                className={`w-full border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white ${own ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                <option value="">Same as Standard</option>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            )}
          </div>
        )
      })}
    </>
  )
}

/** The phone view of Standard. Read-only, and it says why. */
function StandardCard({ standard }: { standard: StandardValues }) {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Dot colour={STANDARD_COLOUR} />
        <p className="font-bold text-slate-900">Standard</p>
        <span className="text-xs text-slate-400">default</span>
      </div>
      <p className="text-xs text-slate-500">Your normal setup — used at every event with no type.</p>
      {SERVICE_KEYS.map(key => {
        const s = standard[key]
        return (
          <div key={key} className="flex items-center justify-between text-sm py-1 border-t border-slate-100">
            <span className="text-slate-700">{SERVICE_LABELS[key]}</span>
            <span className="text-slate-700">
              {s.perVan ? <span className="text-slate-500">Set per van</span>
                : key === 'collection_interval_mins' ? `Every ${standard.collection_interval_mins.value} min`
                : (s.value as boolean) ? 'On' : 'Off'}
            </span>
          </div>
        )
      })}
      <p className="text-xs text-slate-400">Change these in Settings, not here.</p>
    </Card>
  )
}

/** The phone view of one type. */
function TypeCard({ type, standard, editable, colour, onValue, onRename, onDelete }: {
  type: TypeRow
  standard: StandardValues
  editable: boolean
  colour: string
  onValue: (k: ServiceKey, v: boolean | number | null) => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Dot colour={colour} />
        <p className="font-bold text-slate-900 min-w-0 flex-1 truncate">{type.name}</p>
        <button type="button" onClick={onRename} disabled={!editable}
          className="text-xs font-bold text-slate-600 disabled:text-slate-300">Rename</button>
        <button type="button" onClick={onDelete} disabled={!editable}
          className="text-xs font-bold text-red-600 disabled:text-slate-300">Delete</button>
      </div>
      <p className="text-xs text-slate-500">{type.upcoming} upcoming event{type.upcoming === 1 ? '' : 's'}</p>
      {SERVICE_KEYS.map(key => {
        const { own } = settingText(key, type, standard)
        return (
          <div key={key} className="py-1 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor={`et-${type.id}-${key}`}>
              {SERVICE_LABELS[key]}
            </label>
            {key === 'collection_interval_mins' ? (
              <select id={`et-${type.id}-${key}`} value={type.collection_interval_mins ?? ''} disabled={!editable}
                onChange={e => onValue(key, e.target.value === '' ? null : Number(e.target.value))}
                className={`w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white h-11 ${own ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                <option value="">Same as Standard</option>
                {TYPE_INTERVAL_CHOICES.map(n => <option key={n} value={n}>Every {n} min</option>)}
              </select>
            ) : (
              <select id={`et-${type.id}-${key}`} disabled={!editable}
                value={type[key] === null || type[key] === undefined ? '' : (type[key] ? 'on' : 'off')}
                onChange={e => onValue(key, e.target.value === '' ? null : e.target.value === 'on')}
                className={`w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white h-11 ${own ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                <option value="">Same as Standard</option>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            )}
          </div>
        )
      })}
    </Card>
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
