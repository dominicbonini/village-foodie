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
/* 🔴 THE SHARED CONTROLS. `Toggle` is the component page.tsx renders; `Select` is Settings' own
 * styling as a component. This file defines neither, by rule — see the note above TypeControl. */
import { Btn, Toggle, Select, Input } from './primitives'
/* Settings' section-heading token — SERVICE and USED BY use it, like every Settings group. */
import { SUBCARD_HEADING } from '@/lib/ui-tokens'
import {
  SERVICE_ROWS, TYPE_NAME_CHIPS, MAX_TYPE_NAME,
  colourFor, STANDARD_COLOUR, TYPE_INTERVAL_CHOICES, blankTypeValues,
  type EventType, type ServiceRow,
} from '@/lib/event-types/types'
import { summariseType, changedCount, SERVICE_ROW_COUNT, type TypeFor } from '@/lib/event-types/resolve'
import { OFFLINE_PROTECTION_MODES } from '@/lib/copy/offlineProtection'
/* 🔴 EVERY WORD ON THIS SCREEN THAT ALSO APPEARS ON ANOTHER ONE COMES FROM HERE. */
import {
  TYPE_FOLLOWS_VAN_TITLE, TAKES_CASH_ALL_VANS_TITLE,
  EVENT_TYPES_FOOTER_STANDARD, EVENT_TYPES_FOOTER_ONE_EVENT, EVENT_TYPES_SUBTITLE,
  MATCH_STANDARD_LABEL, MATCH_STANDARD_CONFIRM,
} from '@/lib/copy/serviceSettings'
/* The rack size Settings' own buzzer toggle writes when it is switched ON. Standard's buzzer switch
 * makes the same call, so it must use the same default rather than pick a number. */
import { BUZZER_DEFAULT_COUNT } from '@/lib/buzzer'
/* ⚠️ THE SAME `normaliseInterval` SETTINGS USES, so Standard's dropdown cannot send a value its own
 * save path would 400 on. */
import { normaliseInterval } from '@/lib/slot-interval'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** A type as the route returns it, with its upcoming count. */
export interface TypeRow extends EventType { upcoming: number }

/**
 * One active van, as the route sends it.
 *
 * 🔴 THIS EXISTS BECAUSE STANDARD IS EDITABLE PER VAN. Where the vans disagree, the Standard cell
 * renders one control for each of them, so it needs each van's own value and its NAME — the aggregate
 * below can only say "they differ".
 * ⚠️ `takes_cash` IS NOT HERE. It is `trucks.takes_cash`, one value for the whole truck, so it has no
 * per-van form. Its Standard cell is always a single control.
 */
export interface VanRow {
  id: string
  name: string
  order_ready: boolean
  /** Whether this van has a buzzer rack — `buzzer_count !== null`, lib/buzzer.ts's rule. */
  buzzer_prompt: boolean
  buzzer_count: number | null
  offline_enabled: boolean
  offline_mode: string
  collection_interval_mins: number
}

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

/* ── ⛔ `standardText()` IS DELETED, AND ITS DELETION IS THE POINT ────────────────────────────────
 * It rendered Standard's value as a STRING — "Every 15 min", "On", "Set per van" — for a column that
 * was read-only. Every one of its callers is gone: the Standard cell is a control now, the phone card
 * renders the same control, and "Set per van" is not shown anywhere (every cell shows a real value
 * instead — one column per van). A function with no callers that still formats a value is the thing a later reader would
 * reach for and reintroduce the old column with.
 * ⚠️ `OFFLINE_MODE_PAUSE_LABEL` and `OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL` went with it — the two mode
 * names now reach the screen only through `OFFLINE_CHOICES`, which maps them from
 * `OFFLINE_PROTECTION_MODES`. One route from the constants to the screen, not two. */

/** Does this type say anything of its own for this row? Drives the grey "same as Standard" look. */
function rowIsOwn(row: ServiceRow, type: TypeFor): boolean {
  return row.keys.some(k => {
    const v = (type as unknown as Record<string, unknown>)[k]
    return v !== null && v !== undefined
  })
}

/**
 * ── 🔴 THE OFFLINE DROPDOWN'S THREE CHOICES ───────────────────────────────────────────────────────
 * Settings › Kitchen offers a SWITCH and then, when it is on, a MODE. One dropdown says the same
 * thing in one control, which is what the TypesModal board shows — and it is one row because a
 * three-row offline section inside a type column would dwarf every other setting.
 *
 * 🔴 THERE IS NO "Same as Standard" OPTION, AND THAT IS THE 4 OCTOBER CHANGE. There was one, first in
 * the list. A dropdown now lists ONLY REAL SETTINGS; inheriting is shown by the control being FADED
 * and showing the value it inherits, not by a pseudo-option. The old shape asked the operator to read
 * "Same as Standard" and then look across the table to find out what that meant.
 *
 * 🔴 THE TWO MODE LABELS ARE MAPPED FROM `OFFLINE_PROTECTION_MODES`, so this screen, Settings ›
 * Kitchen and the dashboard cannot word them differently. "Off" is the switch being off.
 *
 * ⛔ THE AUTO-REJECT DELAY IS NOT OFFERED ON A TYPE, and that is a decision Dominic confirmed on
 * 4 October 2026 — it stays per-event on the dashboard. See docs/event-types-stage2b-report.md §0.3:
 * the only thing that acts on the delay is a plpgsql function (`claim_order_for_auto_reject`,
 * 20260819) which resolves it as `coalesce(event_override, van)` and cannot read this resolver.
 */
const OFFLINE_CHOICES = [
  { value: 'off', label: 'Off' },
  ...OFFLINE_PROTECTION_MODES.map(m => ({ value: m.value as string, label: m.label })),
] as const

/** What Standard's offline row resolves to, as one of OFFLINE_CHOICES' values. */
function standardOfflineValue(standard: StandardValues): string {
  return standard.offline_protection.enabled ? standard.offline_protection.mode : 'off'
}

/**
 * The dropdown's current value for a TYPE.
 *
 * 🔴 WHEN THE TYPE SAYS NOTHING IT SHOWS WHAT IT INHERITS, not an empty option. The control is faded
 * to say "this is not yours"; the VALUE is the one that will actually be used, which is the question
 * an operator is asking when they look at this cell.
 */
function offlineValue(type: TypeFor, standard: StandardValues): string {
  if (type.offline_protection === false) return 'off'
  if (type.offline_protection === true || type.offline_protection_mode) {
    return type.offline_protection_mode ?? 'pause'
  }
  return standardOfflineValue(standard)
}

/** What a dropdown choice writes to the type's two columns. */
function offlinePatch(value: string): Record<string, unknown> {
  if (value === 'off') return { offline_protection: false, offline_protection_mode: null }
  return { offline_protection: true, offline_protection_mode: value }
}

/**
 * ── 🔴 DO THIS TRUCK'S ACTIVE VANS DISAGREE ON THIS ROW? ──────────────────────────────────────────
 * `perVan` means they are configured differently, so there is no single value that describes them
 * all.
 *
 * ⚠️ NOTHING SAYS SO ON SCREEN ANY MORE, AND THAT IS DELIBERATE. Three versions of this build drew a
 * phrase in the cell instead of a value — "Set per van", then "Varies by van" — and all of them were
 * removed: every cell now shows a real setting, and an inheriting type cell shows the FIRST van's
 * value faded, with `TYPE_FOLLOWS_VAN_TITLE` on hover.
 * 🔴 SO WHAT THIS FUNCTION STILL DECIDES IS ONLY THE HOVER TEXT AND THE INTERVAL FALLBACK, not the
 * layout: the Standard side draws one column per van whether they agree or not, so that equalising
 * two vans moves nothing on screen.
 */
function standardIsPerVan(row: ServiceRow, standard: StandardValues): boolean {
  if (row.id === 'collection_interval_mins') return standard.collection_interval_mins.perVan
  if (row.id === 'offline_protection') return standard.offline_protection.perVan
  const s = standard[row.id as 'buzzer_prompt' | 'takes_cash' | 'order_ready']
  return s.perVan
}

/** Standard's value for a SWITCH row. Only meaningful when `standardIsPerVan` is false. */
function standardSwitchValue(row: ServiceRow, standard: StandardValues): boolean {
  const s = standard[row.id as 'buzzer_prompt' | 'takes_cash' | 'order_ready']
  return s.value === true
}

/**
 * ── 🔴 WHAT ONE STANDARD ROW WRITES, AND THROUGH WHICH SETTINGS ACTION ────────────────────────────
 * Each entry is the action name and payload Settings itself sends for that setting, so Standard's
 * controls are not a second save path — they are the SAME call.
 *
 * 🔴 `scope: 'van'` MEANS ONCE PER ACTIVE VAN. Standard is not a row anywhere; for these settings it
 * is "what every van does", so changing it means writing every van. The modal loops the van ids the
 * route sent and calls `update_van_settings` for each, with the payload below — which is precisely
 * what Settings does when an operator changes the same control on each van's card in turn.
 * ⚠️ THE CAMEL KEYS ARE NOT A STYLE CHOICE. `update_van_settings` destructures `autoPauseOnOffline`
 * and `offlineProtectionMode` while the COLUMNS are snake_case, and that handler's own comment warns
 * that a key it does not destructure is dropped SILENTLY — a green save that wrote nothing. The two
 * order-ready and interval keys really are the column names. Getting one of these wrong is invisible
 * at runtime, which is why scripts/event-types.cjs pins every one of them against Settings' own call.
 */
type StandardWrite =
  | { scope: 'van'; action: 'update_van_settings'; payload: Record<string, unknown> }
  | { scope: 'truck'; action: 'update_truck'; payload: Record<string, unknown> }

function standardWriteFor(row: ServiceRow, value: boolean | number | string): StandardWrite | null {
  switch (row.id) {
    case 'collection_interval_mins':
      /* ⚠️ THE CUSTOMER COLUMN ONLY, exactly as Settings' own <select> does. The operator column has
       * its own tickbox on that card and is not what a type replaces. */
      return { scope: 'van', action: 'update_van_settings', payload: { collection_interval_mins: normaliseInterval(Number(value)) } }
    case 'order_ready':
      return { scope: 'van', action: 'update_van_settings', payload: { order_ready_enabled: value === true } }
    case 'takes_cash':
      /* The one truck-level setting of the five — `trucks.takes_cash`, no per-van column. Settings
       * writes it with `saveSetting('takes_cash', next)`, which is `update_truck` with a data bag. */
      return { scope: 'truck', action: 'update_truck', payload: { takes_cash: value === true } }
    case 'offline_protection':
      /* ⚠️ "Off" WRITES ONLY THE SWITCH AND LEAVES THE MODE STORED, which is what Settings does —
       * turning protection back on should not silently change what it will then do. Choosing a mode
       * writes both, because a mode with the switch off would display and do nothing. */
      return value === 'off'
        ? { scope: 'van', action: 'update_van_settings', payload: { autoPauseOnOffline: false } }
        : { scope: 'van', action: 'update_van_settings', payload: { autoPauseOnOffline: true, offlineProtectionMode: String(value) } }
    case 'buzzer_prompt':
      /* ── 🔴 THE BUZZER ROW WRITES THE RACK, THROUGH SETTINGS' OWN TOGGLE CALL ───────────────────
       * Dominic, 4 October 2026: bind Standard to whatever control Settings uses to turn buzzers
       * on/off for a van — and STOP if there is no such action. THERE IS: Settings › Your trucks
       * renders a toggle whose click is
       *   updateVanSetting(van.id, 'buzzer_count', van.buzzer_count == null ? BUZZER_DEFAULT_COUNT : null)
       * so this is that exact call. No new save path, and no STOP required.
       *
       * ⚠️ THE ROW'S TWO COLUMNS ARE DIFFERENT SETTINGS, AND THE REPORT SAYS SO. A TYPE's cell writes
       * `event_types.buzzer_prompt` (the per-event prompt, which is what the label names); STANDARD's
       * writes `truck_vans.buzzer_count` (whether the van has a rack). Standard's DISPLAYED value was
       * already derived from the rack, so this makes its display and its control agree — where before
       * the display came from the rack and there was no control at all. A truck-level prompt column
       * would be a migration and a new setting, which is not this build.
       * ⚠️ ON WRITES `BUZZER_DEFAULT_COUNT`, NOT 1 — the same number Settings' toggle writes. */
      return { scope: 'van', action: 'update_van_settings', payload: { buzzer_count: value === true ? BUZZER_DEFAULT_COUNT : null } }
    default:
      /* Nothing reaches here today: every one of the five rows is writable. Kept so a row added in a
       * later stage is read-only rather than silently writing the wrong column. */
      return null
  }
}

/* ── 🔴 THE COLUMN WIDTHS, AS NUMBERS, BECAUSE TWO THINGS COMPUTE FROM THEM ────────────────────────
 * The grid's `gridTemplateColumns` and the DIALOG'S OWN WIDTH. When those two disagree you get either
 * an empty band to the right of the table (the dialog wider than its content) or a scrollbar that
 * appears one type too early. They were separate literals; now there is one source.
 * ⚠️ `MODAL_SIDE_PADDING` IS THE SCROLLER'S `px-2` DOUBLED (8px each side). If that class changes,
 * change this with it — the dialog would otherwise be 16px narrow and scroll a table that fits. */
/* ⚠️ NARROWED (4 October 2026, Dominic: "reduce the width of the columns … its too wide"). They
 * were 230/200, which came from the board. At that size a two-van truck with three types needed
 * 1246px of grid for five controls and a label — so the table scrolled sideways on a laptop for a
 * truck with an ordinary number of types.
 * 🔴 THE LABEL COLUMN IS STILL THE WIDER ONE, because the longest thing on any row is still the
 * label ("Remind me to add a buzzer"); the measurement harness asserts it is not clipped at 200px, so
 * this is the floor rather than a guess. */
/* ⚠️ 212px IS THE MEASURED FLOOR, NOT A GUESS. The labels went from 13px to 14px to match the
 * controls beside them (Dominic: "row labels all use the same font size"), and at 206px
 * "Remind me to add a buzzer" wraps to two lines — scripts/event-types-render.cjs measures the text
 * node's rendered line count at every width and in both engines, so this number has a check behind
 * it. Narrower than this and that harness goes red. */
const GRID_LABEL_W = 212
const GRID_COL_W = 168
const MODAL_SIDE_PADDING = 16

/* ── 🔴 THE COLUMN DIVIDER, ONE DEFINITION ────────────────────────────────────────────────────────
 * Every cell right of the label column draws its own LEFT border, which is what makes a continuous
 * vertical line down the grid. `border-slate-100` is the row dividers' colour, deliberately: two
 * weights of line in one table would read as a hierarchy that is not there.
 * ⚠️ IT IS PER CELL, NOT ONE ELEMENT PER COLUMN. A CSS grid has no column elements to style, and the
 * alternative — a repeating background gradient sized to the columns — would be a one-off style that
 * silently breaks the moment a width changes. The two full-width section headings (SERVICE, USED BY)
 * are the only rows the line does not cross, because they genuinely span every column. */
const CELL_DIVIDER = 'border-l border-slate-100'

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

export function EventTypesPanel({ token, onClose, manageApi }: {
  token: string
  onClose: () => void
  /**
   * ── 🔴 THE MANAGE PAGE'S OWN `api`, PASSED IN. THIS IS THE "NO SECOND SAVE PATH" RULE, LITERALLY ──
   * Standard's values live on the truck and the vans, and the only sanctioned way to change them is
   * the actions Settings calls. Rather than re-implement a fetch to /api/manage here — which would be
   * a second path by definition, and would miss `nativeAuthHeader()`, so every Standard change would
   * 401 inside the native app — the page hands this component THE SAME FUNCTION its own Settings
   * controls call. Same action names, same payload shapes, same auth, same validation, and any
   * fan-out that action grows later (the "Same as Van 1" copy on the schedule-graphics branch, for
   * one) applies here the moment the branches meet, with nothing to change in this file.
   * ⚠️ OPTIONAL, AND STANDARD IS READ-ONLY WITHOUT IT. A caller that cannot supply it gets the old
   * behaviour rather than a broken control — better than a switch that looks live and writes nothing.
   */
  manageApi?: (action: string, extra?: Record<string, unknown>) => Promise<unknown>
}) {
  const [loading, setLoading] = useState(true)
  const [types, setTypes] = useState<TypeRow[]>([])
  const [standard, setStandard] = useState<StandardValues | null>(null)
  /* 🔴 THE ACTIVE VANS, WITH THEIR NAMES AND THEIR OWN VALUES. Needed because a Standard row whose
   * vans disagree now renders ONE CONTROL PER VAN rather than a link to Settings. */
  const [vans, setVans] = useState<VanRow[]>([])
  const vanIds = useMemo(() => vans.map(v => v.id), [vans])
  const [standardBusy, setStandardBusy] = useState(false)
  const [confirmMatch, setConfirmMatch] = useState<string | null>(null)
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
  /* `null` is the combined Standard column. With several vans the picker's first entry is
   * `van:<first van>`, and `null` never matches one — so the effect below seeds it. */
  const [phoneType, setPhoneType] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api(token, { action: 'load' })
      setTypes((r.types ?? []) as TypeRow[])
      setStandard(r.standard ?? null)
      setVans(Array.isArray(r.vans) ? (r.vans as VanRow[]) : [])
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

  /**
   * ── 🔴 MATCH STANDARD — EVERY SETTING ON THIS TYPE BACK TO NULL ────────────────────────────────
   * The way back to inheriting, now that no control carries its own "Same as Standard" affordance.
   * It is in the ⋯ menu beside Rename/Move/Delete because it is a whole-type action, and it asks
   * first because it is the only item in that menu that throws work away.
   * ⚠️ IT SENDS `blankTypeValues()`, the SAME starting state `create` uses, rather than listing the
   * columns here — so a setting added in a later stage is reset by this without touching this line.
   */
  const matchStandard = (id: string) =>
    act({ action: 'update', id, ...blankTypeValues() }, () => setConfirmMatch(null))

  /**
   * ── 🔴 CHANGING STANDARD. ONE SETTING, EVERY ACTIVE VAN, THROUGH SETTINGS' OWN ACTION ──────────
   * `standardWriteFor` returns the action name and payload Settings sends for that row; this just
   * delivers it — once for the truck, or once per active van.
   *
   * ⚠️ SEQUENTIAL, NOT `Promise.all`. These are writes to the same table from the same operator, and
   * the order-ready branch of `update_van_settings` also bulk-writes every event for the truck. Firing
   * them in parallel would have N of those racing each other for no gain on a truck with two vans.
   * ⚠️ IT RELOADS AFTERWARDS rather than patching local state. The route recomputes `perVan` from the
   * vans it reads, and that flag is the whole behaviour of this column — guessing it here is how the
   * cell would come to disagree with the database.
   * 🔴 A FAILURE IS SHOWN AND NOTHING IS GUESSED. If one van's write fails, the reload shows what
   * actually landed — the two van columns then hold different values, visibly, which is exactly what
   * an operator needs in order to fix it. Patching local state optimistically would hide it.
   */
  /**
   * ── 🔴 CHANGING ONE VAN'S VALUE FROM THE STANDARD COLUMN ────────────────────────────────────────
   * The same action and the same payload as `saveStandard`, aimed at a single `vanId` instead of
   * every one. It shares `standardWriteFor`, so a per-van control and a whole-truck control cannot
   * send different things for the same row — which is the failure this split would otherwise invite.
   */
  const saveStandardForVan = async (row: ServiceRow, vanId: string, value: boolean | number | string) => {
    const write = standardWriteFor(row, value)
    /* ⚠️ A TRUCK-LEVEL ROW HAS NO PER-VAN FORM, and `StandardControl` never renders a per-van control
     * for one — this guard is here so a future caller cannot write the truck N times by mistake. */
    if (!write || write.scope !== 'van' || !manageApi) return
    setStandardBusy(true); setMsg(null)
    try {
      await manageApi(write.action, { vanId, ...write.payload })
      await load()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not save', bad: true })
      await load()
    } finally { setStandardBusy(false) }
  }

  const saveStandard = async (row: ServiceRow, value: boolean | number | string) => {
    const write = standardWriteFor(row, value)
    if (!write || !manageApi) return
    setStandardBusy(true); setMsg(null)
    try {
      if (write.scope === 'truck') {
        await manageApi(write.action, { data: write.payload })
      } else {
        if (vanIds.length === 0) throw new Error('This truck has no vans to change.')
        for (const vanId of vanIds) await manageApi(write.action, { vanId, ...write.payload })
      }
      await load()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not save', bad: true })
      await load()
    } finally { setStandardBusy(false) }
  }

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

  /**
   * ── 🔴 THE VAN COLUMNS. ONE PER ACTIVE VAN, OR NONE ───────────────────────────────────────────
   * Two or more active vans ⇒ each gets a column of its own, oldest first (the route orders them, so
   * "first van" here is the same first van the rest of the product means). One van ⇒ empty, and a
   * single combined "Standard" column is drawn instead.
   *
   * 🔴 IT DOES NOT DEPEND ON WHETHER THE VANS AGREE, and that is the instruction's point: the shape
   * of the screen is a fact about the truck, never about the values in it. The design this replaced
   * grew per-van controls only when the values differed, so equalising two vans made every row below
   * jump upwards.
   */
  const vanColumns = useMemo(() => (vans.length > 1 ? vans : []), [vans])
  /** Every column right of the labels, in render order: the van(s), then the types. */
  const valueColumnCount = (vanColumns.length > 1 ? vanColumns.length : 1) + types.length
  /* The phone picker's list — the van columns, then the types, in the same order as the grid.
   * ⚠️ `id: null` IS THE COMBINED STANDARD COLUMN; `vanId` is a single van's. */
  const columns = useMemo(
    () => [
      ...(vanColumns.length > 1
        ? vanColumns.map(v => ({ id: `van:${v.id}`, name: v.name, vanId: v.id }))
        : [{ id: null as string | null, name: 'Standard', vanId: null as string | null }]),
      ...types.map(t => ({ id: t.id, name: t.name, vanId: null as string | null })),
    ],
    [vanColumns, types],
  )
  /**
   * ── 🔴 WHICH COLUMN THE PHONE IS SHOWING, DERIVED — NOT STORED ────────────────────────────────
   * `phoneType` starts as `null`, which means the combined Standard column. With two or more vans
   * there IS no combined column: the picker's first entry is `van:<first van>`. So without this the
   * select would show "Main van" selected while the card below it showed the aggregate — two
   * different answers on one screen.
   * ⚠️ DERIVED RATHER THAN SEEDED IN AN EFFECT. Writing state from an effect to match a prop is the
   * `react-hooks/set-state-in-effect` pattern this codebase has been bitten by; a value computed from
   * what is already known cannot be stale by a render.
   * ⚠️ IT ALSO SURVIVES A VAN BEING DELETED while the modal is open: the id no longer matches a
   * column, so the picker falls back to the first one rather than showing an empty card.
   */
  const phoneSel = useMemo(() => {
    if (phoneType && columns.some(c => c.id === phoneType)) return phoneType
    return columns.length ? columns[0].id : null
  }, [phoneType, columns])

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
      {/* ── 🔴 IT FITS ITS COLUMNS, AND IS CAPPED AT 1000px ────────────────────────────────────────
        * It was `w-full max-w-[1000px]`, so a truck with ONE type got a 1000px dialog holding 630px of
        * table and an empty band to the right of it — the width said "there is more here" and there
        * was not.
        * Now the width is the CONTENT's width, capped: label column + one column per type and
        * Standard, plus the horizontal padding. Past the cap the columns scroll sideways inside the
        * dialog, which is what the cap is for.
        * ⚠️ `maxWidth: min(1000px, 100%)` NOT `max-w-[1000px]`, so the cap never beats the viewport on
        * a tablet in portrait — 1000px of dialog on an 820px screen would clip the close button.
        * ⚠️ THE NUMBERS COME FROM THE SAME CONSTANTS THE GRID USES. Two places computing the same
        * width from different literals is how the empty band appeared in the first place. */}
      <div role="dialog" aria-modal="true" aria-label="Event types"
        data-event-types-modal
        /* ⚠️ `valueColumnCount`, NOT `types.length + 1`. A two-van truck with two types now has FOUR
          * value columns, and the dialog has to be as wide as its content or the empty band this
          * expression exists to remove comes back on the other axis. */
        style={{ width: GRID_LABEL_W + GRID_COL_W * valueColumnCount + MODAL_SIDE_PADDING, maxWidth: 'min(1000px, 100%)' }}
        className="bg-white max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* ── HEADER ───────────────────────────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-slate-200">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-slate-900 text-lg">Event types</h2>
            {/* 🔴 "Grey = same as Standard" IS GONE. Nothing on this screen is grey-as-a-legend any
              * more: a faded control shows the value it inherits, which needs no key. A legend for a
              * state that no longer exists is worse than no legend. */}
            <p className="text-xs sm:text-[13px] text-slate-500">{EVENT_TYPES_SUBTITLE}</p>
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
                  {/* 🔴 THE PICKER LISTS THE VAN COLUMNS AND THEN THE TYPES, in the grid's order, so
                    * picking a name on a phone picks the same column that name heads on a tablet.
                    * ⚠️ THE LABEL IS NOT "Event type" ANY MORE — the list is no longer only types. */}
                  <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="et-phone-pick">Column</label>
                  <Select className="w-full" ariaLabel="Column"
                    value={phoneSel ?? ''}
                    options={columns.map(c => ({ value: c.id ?? '', label: c.name }))}
                    onChange={v => setPhoneType(v || null)} />
                </div>
                {/* ⚠️ THREE CASES, AND THE `van:` PREFIX IS WHAT TELLS THEM APART. A van's id and a
                  * type's id are both opaque strings, so without the prefix a phone could not know
                  * which kind of column it had been given. */}
                {(() => {
                  if (phoneSel === null) {
                    return (
                      <StandardCard standard={standard} van={null} editable={editable}
                        onStandard={(r, v) => void saveStandard(r, v)}
                        onStandardVan={(r, vanId, v) => void saveStandardForVan(r, vanId, v)}
                        standardBusy={standardBusy || !manageApi} />
                    )
                  }
                  if (phoneSel.startsWith('van:')) {
                    const van = vans.find(v => v.id === phoneSel.slice(4))
                    if (!van) return <p className="text-sm text-slate-400">That van has gone.</p>
                    return (
                      <StandardCard standard={standard} van={van} editable={editable}
                        onStandard={(r, v) => void saveStandard(r, v)}
                        onStandardVan={(r, vanId, v) => void saveStandardForVan(r, vanId, v)}
                        standardBusy={standardBusy || !manageApi} />
                    )
                  }
                  const t = typeById.get(phoneSel)
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
                  /* 🔴 THE LABEL COLUMN IS THE WIDE ONE (230px) AND THE VALUE COLUMNS ARE 200px.
                   * It was the other way round — 200px of label beside 230px columns — which gave
                   * "Remind me to add a buzzer" less room than the switch it describes. The board's
                   * template is `230px repeat(n, 200px)` and these two constants are it. */
                  /* 🔴 VAN COLUMNS ARE THE SAME WIDTH AS TYPE COLUMNS, as instructed — one `repeat`
                   * over every value column, so they cannot be given different widths by accident. */
                  style={{ display: 'grid', gridTemplateColumns: `${GRID_LABEL_W}px repeat(${valueColumnCount}, ${GRID_COL_W}px)` }}
                  data-types-grid
                >
                  {/* heading row */}
                  <div className="px-3.5 py-3" />
                  {/* The header of the highlighted column carries the same highlight as its cells. */}
                  {/* ── 🔴 THE STANDARD HEADERS ────────────────────────────────────────────────
                    * Two or more vans ⇒ one header per van, showing the van's NAME with a small
                    * "Standard" tag beside it, each keeping the Standard highlight. The tag is what
                    * says these columns are the truck's usual setup rather than more event types —
                    * without it a van column and a type column would be indistinguishable.
                    * One van ⇒ the single "Standard" header, unchanged. */}
                  {vanColumns.length > 1 ? vanColumns.map(v => (
                    <div key={v.id} className={`${CELL_DIVIDER} px-2.5 py-3 flex items-center gap-1.5 min-w-0`}>
                      <Dot colour={STANDARD_COLOUR} />
                      <span className="text-[13px] font-bold text-slate-800 truncate" title={v.name}>{v.name}</span>
                      <span className="text-[11px] text-slate-400 font-semibold shrink-0">Standard</span>
                    </div>
                  )) : (
                    <div className={`${CELL_DIVIDER} px-2.5 py-3 flex items-center gap-1.5 min-w-0`}>
                      <Dot colour={STANDARD_COLOUR} />
                      <span className="text-[13px] font-bold text-slate-800 truncate">Standard</span>
                      <span className="text-[11px] text-slate-400 font-semibold shrink-0">default</span>
                    </div>
                  )}
                  {types.map((t, i) => (
                    <div key={t.id} className={`${CELL_DIVIDER} px-2.5 py-3 flex items-center gap-1.5 min-w-0 relative`}>
                      <Dot colour={colourFor(i)} />
                      <span className="text-[13px] font-bold text-slate-800 truncate">{t.name}</span>
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
                          {/* 🔴 THE WAY BACK TO INHERITING, AND THE ONLY ONE. Every per-control "Same
                            * as Standard" affordance is gone, so this is what clears a type. It sits
                            * between Move right and Delete, as the board's note has it. */}
                          <button type="button" className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50"
                            onClick={() => { setConfirmMatch(t.id); setMenuFor(null) }}>{MATCH_STANDARD_LABEL}</button>
                          <button type="button" className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-red-700"
                            onClick={() => { setConfirmDelete(t.id); setMenuFor(null) }}>Delete</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* ⚠️ `SUBCARD_HEADING` — THE TOKEN SETTINGS' OWN GROUP HEADINGS USE (lib/ui-tokens.ts,
                    * "Accepting orders", "Taking payment"). It was a one-off
                    * `text-[11px] font-bold text-slate-500 tracking-[0.06em]` here, which is a
                    * different size, weight, colour and tracking from every heading on the page
                    * behind it. */}
                  <div className={`col-span-full px-3 pt-3.5 pb-1.5 ${SUBCARD_HEADING}`}
                    style={{ gridColumn: '1 / -1' }}>SERVICE</div>

                  {SERVICE_ROWS.map(row => (
                    <SettingRow key={row.id} row={row} types={types} standard={standard}
                      vanColumns={vanColumns}
                      editable={editable} onPatch={patch}
                      onStandard={(r, v) => void saveStandard(r, v)}
                      onStandardVan={(r, vanId, v) => void saveStandardForVan(r, vanId, v)}
                      standardBusy={standardBusy || !manageApi} />
                  ))}

                  <div className={`col-span-full px-3 pt-3.5 pb-1.5 ${SUBCARD_HEADING}`}
                    style={{ gridColumn: '1 / -1' }}>USED BY</div>
                  <div className="px-3 py-2.5 border-t border-slate-100 text-sm font-semibold text-slate-900 min-h-11 flex items-center">
                    Upcoming events
                  </div>
                  {/* ⚠️ "Everything else" IS A FACT ABOUT THE TRUCK, NOT ABOUT A VAN — every event with
                    * no type, whichever van runs it. So it SPANS the van columns rather than being
                    * repeated, for the same reason a truck-level setting does. */}
                  <div className={`${CELL_DIVIDER} px-2.5 py-2.5 border-t border-slate-100 text-sm text-slate-600 min-h-11 flex items-center justify-center`}
                    style={vanColumns.length > 1 ? { gridColumn: `span ${vanColumns.length}` } : undefined}>
                    Everything else
                  </div>
                  {types.map(t => (
                    <div key={t.id} className={`${CELL_DIVIDER} px-2.5 py-2.5 border-t border-slate-100 text-sm text-slate-700 min-h-11 flex items-center justify-center`}>
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
        {/* 🔴 TWO LINES, AND THE FIRST ONE IS A PROMISE THE SAVE PATH KEEPS. "Changing it here also
          * changes it in Settings" is true only because `saveStandard` calls Settings' own action. The
          * old footer said the opposite — "Change it in Settings" — because Standard was read-only. */}
        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 text-[13px] text-slate-500 leading-relaxed">
          {EVENT_TYPES_FOOTER_STANDARD}<br />
          {EVENT_TYPES_FOOTER_ONE_EVENT}
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
            {/* ⚠️ THE SHARED <Input>, which is what every other text box in Manage is. The local box
              * here was `rounded-xl px-3 py-2 h-11` with a hand-written aria-label; `Input` carries its
              * own <label> and the page's focus ring. */}
            <Input label="Name" value={renameTo} onChange={setRenameTo} maxLength={MAX_TYPE_NAME} />
            <div className="flex gap-2 justify-end">
              <Btn label="Cancel" colour="slate" size="sm" onClick={() => setRenaming(null)} />
              <Btn label="Save" size="sm" disabled={!editable || !renameTo.trim()}
                onClick={() => void act({ action: 'update', id: renaming, name: renameTo }, () => setRenaming(null))} />
            </div>
          </div>
        </div>
      )}

      {/* ── MATCH STANDARD ───────────────────────────────────────────────────────────────────── */}
      {confirmMatch && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setConfirmMatch(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3">
            <p className="font-bold text-slate-900">
              {MATCH_STANDARD_LABEL} for “{typeById.get(confirmMatch)?.name ?? 'this type'}”?
            </p>
            <p className="text-sm text-slate-600">{MATCH_STANDARD_CONFIRM}</p>
            {/* ⚠️ IT SAYS WHAT SURVIVES. Per-event changes are not touched by this — it writes the
              * TYPE's columns only — and an operator about to press it should not have to guess. */}
            <p className="text-xs text-slate-500">
              Anything you changed on a single event’s dashboard stays as it is.
            </p>
            <div className="flex gap-2 justify-end">
              <Btn label="Cancel" colour="slate" size="sm" onClick={() => setConfirmMatch(null)} />
              <Btn label={MATCH_STANDARD_LABEL} size="sm" disabled={!editable}
                onClick={() => void matchStandard(confirmMatch)} />
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
 * The label, then the STANDARD COLUMNS, then one cell per type.
 *
 * ── 🔴 ONE COLUMN PER ACTIVE VAN, NOT ONE CELL HOLDING A STACK ───────────────────────────────────
 * Dominic, 4 October 2026, replacing the stacked design of a few hours earlier: "2+ active vans:
 * replace the Standard column with ONE COLUMN PER ACTIVE VAN, first van first."
 *
 * The stacked version put two controls inside one 200px cell with a small "Van1"/"Van2" label beside
 * each. It worked, and it was wrong for two reasons the column version fixes:
 *   • THE CELL GREW AND THE ROW GREW WITH IT, so a two-van truck's rows were twice the height of a
 *     one-van truck's and the type columns beside them were mostly empty space.
 *   • IT ONLY APPEARED WHEN THE VANS DIFFERED, so the layout JUMPED the moment a value changed —
 *     equalise two vans and a stack of two collapsed into one control, moving every row below it.
 *
 * 🔴 SO THE COLUMNS EXIST WHETHER OR NOT THE VANS AGREE. That is the explicit instruction and it is
 * the whole point: the shape of the screen is a fact about the truck (how many vans it has), never
 * about the values currently in it. Nothing moves when a value changes.
 *
 * ── 🔴 A TRUCK-LEVEL ROW SPANS THEM ALL ──────────────────────────────────────────────────────────
 * `takes_cash` is `trucks.takes_cash` — ONE column in the database for the whole truck. Repeating it
 * per van would draw two or five switches that always move together, which is a lie about the data:
 * an operator would reasonably expect to set cash for one van and not another, and could not. So it
 * renders as ONE control spanning every van column. The report lists which rows are which.
 */
function SettingRow({ row, types, standard, vanColumns, editable, onPatch, onStandard, onStandardVan, standardBusy }: {
  row: ServiceRow
  types: TypeRow[]
  standard: StandardValues
  /* ⚠️ `vans` WAS A SECOND PROP HERE AND IS GONE. It carried the same list as `vanColumns` except
   * when there was only one van, and nothing in this component read it — two names for one list is
   * how a row ends up iterating the wrong one. The single-van case is `vanColumns.length <= 1`. */
  /** The vans that have a column of their own. Empty ⇒ one combined "Standard" column. */
  vanColumns: VanRow[]
  editable: boolean
  onPatch: (id: string, values: Record<string, unknown>) => void
  onStandard: (row: ServiceRow, value: boolean | number | string) => void
  onStandardVan: (row: ServiceRow, vanId: string, value: boolean | number | string) => void
  standardBusy: boolean
}) {
  const canEdit = editable && !standardBusy
  /* 🔴 TRUCK-LEVEL ROWS ARE IDENTIFIED BY WHERE THEY WRITE, not by a list kept beside this one.
   * `standardWriteFor` already has to know, because it picks the action — so asking it is the one
   * answer that cannot fall out of step with what the save actually does. */
  const truckLevel = standardWriteFor(row, false)?.scope === 'truck'
  /* The cell class, shared by every Standard cell so the highlight cannot be applied unevenly. */
  /* ⛔ NO HIGHLIGHT (4 October 2026, Dominic: "remove the colour coding that standard uses, all
   * columns should be same colour"). The Standard columns carried `bg-orange-50`. With one column per
   * VAN the tint was colouring one or two columns out of five, which read as "these are selected"
   * rather than "these are your usual setup" — and the small "Standard" tag in the header already
   * says which they are, in words.
   * 🔴 CENTRED, like every other cell. A switch pinned left under a column header looked like it
   * belonged to the header's left edge rather than to the column.
   * 🔴 `border-l` IS THE COLUMN DIVIDER. With the tint gone there was nothing separating five columns
   * of switches, so a row read as a line of controls rather than one control per column. Every cell
   * right of the labels carries a left border in `border-slate-100` — the SAME colour as the row
   * dividers, so the grid reads as a grid rather than as two different kinds of line. */
  const STD_CELL = `${CELL_DIVIDER} px-2.5 py-2.5 border-t border-slate-100 min-h-11 flex items-center justify-center gap-2`

  return (
    <>
      {/* 🔴 `text-sm` — THE SAME SIZE AS THE CONTROLS BESIDE IT, and the size every settings row in
        * Manage uses. It was `text-[13px]` while the dropdowns were 14px, so the label and its own
        * control were different sizes. Dominic: "dropdown text, switch labels and row labels all use
        * the same font size, weight and line height as the rest of Manage's settings rows."
        * ⚠️ THE LABEL COLUMN WAS WIDENED TO 214px TO PAY FOR IT. At 200px and 14px, "Remind me to add
        * a buzzer" wrapped to two lines; the render harness measures that it does not. */}
      <div className="px-3 py-2.5 border-t border-slate-100 text-sm font-semibold text-slate-900 min-h-11 flex items-center">
        {row.label}
      </div>

      {/* ── THE STANDARD SIDE ──────────────────────────────────────────────────────────────────── */}
      {vanColumns.length > 1 ? (
        /* ── 🔴 ONE CELL PER VAN COLUMN, FOR EVERY ROW — INCLUDING THE TRUCK-LEVEL ONE ────────────
          * Dominic, 4 October 2026: "Each van column gets its own switch, like every other row. No
          * control spanning two columns." The truck-level row used to span them, and the result was
          * one switch sitting under the first van's header with nothing under the second's — which he
          * read, correctly, as "van 1 has a toggle but van 2 doesn't".
          *
          * 🔴 A TRUCK-LEVEL ROW DRAWS THE SAME SETTING IN EVERY COLUMN. `takes_cash` is
          * `trucks.takes_cash`: one column for the whole truck. So each cell shows the SAME value and
          * writes the SAME `update_truck` call, and they move together — which is why each carries a
          * title saying so. Drawing it per column is a presentational choice that keeps the grid
          * regular; it is not a claim that cash can differ by van, and the title is what stops it
          * being read as one.
          * ⚠️ NO "Van1"/"Van2" LABEL INSIDE A CELL — the COLUMN HEADER carries the name. */
        vanColumns.map(v => (
          <div key={v.id} className={STD_CELL}>
            <OneStandardControl row={row} editable={canEdit}
              value={truckLevel ? standardValue(row, standard) : vanValue(row, v)}
              label={`${row.label} for ${v.name}`}
              title={truckLevel ? TAKES_CASH_ALL_VANS_TITLE : undefined}
              onChange={value => (truckLevel ? onStandard(row, value) : onStandardVan(row, v.id, value))} />
          </div>
        ))
      ) : (
        /* ── ONE VAN (or none): a single "Standard" column, writing every active van. ───────────── */
        <div className={STD_CELL}>
          <OneStandardControl row={row} editable={canEdit} value={standardValue(row, standard)}
            label={`${row.label} for Standard`} onChange={v => onStandard(row, v)} />
        </div>
      )}

      {/* ── THE TYPES, AFTER THE VAN COLUMNS ───────────────────────────────────────────────────── */}
      {types.map(t => (
        <div key={t.id} className={`${CELL_DIVIDER} px-2.5 py-2.5 border-t border-slate-100 min-h-11 flex items-center justify-center gap-2`}>
          <TypeControl row={row} type={t} standard={standard} editable={editable}
            onPatch={v => onPatch(t.id, v)} />
        </div>
      ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1a-ii · THE STANDARD CELL
// ════════════════════════════════════════════════════════════════════════════════════════════════

/* ── ⛔ `StandardControl` IS DELETED ───────────────────────────────────────────────────────────────
 * It was the component that decided, inside one cell, whether to draw a single control or a stack of
 * per-van ones. With one column per van that decision belongs to the GRID — `SettingRow` emits one
 * cell per column and each holds exactly one `<OneStandardControl>` — so a component whose whole job
 * was branching inside a cell has no job left. Leaving it would be leaving the stacked design in the
 * file for someone to reach for.
 * ⚠️ `vanValue`, `standardValue` and `OneStandardControl` all survive and are what it used; they are
 * below, called directly by `SettingRow` and by the phone card.
 */

/** One van's value for a row, in the shape the control wants. */
function vanValue(row: ServiceRow, v: VanRow): boolean | number | string {
  if (row.id === 'collection_interval_mins') return v.collection_interval_mins
  if (row.id === 'offline_protection') return v.offline_enabled ? v.offline_mode : 'off'
  if (row.id === 'buzzer_prompt') return v.buzzer_prompt
  return v.order_ready
}

/** Standard's aggregate value for a row, in the shape the control wants. */
function standardValue(row: ServiceRow, standard: StandardValues): boolean | number | string {
  if (row.id === 'collection_interval_mins') return standard.collection_interval_mins.value
  if (row.id === 'offline_protection') return standardOfflineValue(standard)
  return standardSwitchValue(row, standard)
}

/**
 * ONE Standard control — a switch or a dropdown, both from the shared primitives.
 *
 * ⚠️ THE SAME COMPONENT WHETHER IT WRITES ONE VAN OR ALL OF THEM. Only `value` and `onChange` differ,
 * which is what stops a van column and a single Standard column looking like two kinds of thing.
 */
function OneStandardControl({ row, value, label, title, editable, onChange }: {
  row: ServiceRow
  value: boolean | number | string
  label: string
  /** Hover text. Used for the truck-level row, where the same setting appears in every van column. */
  title?: string
  editable: boolean
  onChange: (value: boolean | number | string) => void
}) {
  if (row.kind === 'interval') {
    return (
      <Select className="flex-1" ariaLabel={label} disabled={!editable}
        value={String(value)} title={title ?? `Every ${value} min`}
        options={TYPE_INTERVAL_CHOICES.map(n => ({ value: String(n), label: `Every ${n} min` }))}
        onChange={v => onChange(Number(v))} />
    )
  }
  if (row.kind === 'offline') {
    return (
      <Select className="flex-1" ariaLabel={label} disabled={!editable}
        value={String(value)}
        title={title ?? OFFLINE_CHOICES.find(c => c.value === value)?.label ?? ''}
        options={OFFLINE_CHOICES.map(c => ({ value: c.value, label: c.label }))}
        onChange={v => onChange(v)} />
    )
  }
  return (
    <Toggle on={value === true} disabled={!editable} ariaLabel={label} title={title}
      onToggle={() => onChange(!(value === true))} />
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1a-iii · ONE TYPE'S CELL
// ════════════════════════════════════════════════════════════════════════════════════════════════

/* ══ 🔴 THE CONTROLS ARE THE APP'S CONTROLS. THIS FILE DEFINES NONE ═══════════════════════════════
 * Dominic, 4 October 2026, twice: first "the boxes and options formatting is consistent with other
 * pages — it looks different", then "use the app's existing components and styles: the same switch
 * component, the same select/dropdown component and styling as Settings".
 *
 * He was right both times, and the cause was that this file had built its own. There were THREE
 * switches in the product — Manage's, the dashboard card's, and a third written here — and this one
 * had copied the DASHBOARD's geometry and orange into a MANAGE screen, so the modal's switches were
 * orange where every switch on the page behind them was green.
 *
 * 🔴 SO BOTH CONTROLS NOW COME FROM components/manage/primitives.tsx, which page.tsx imports too.
 * `<Toggle>` was MOVED there out of page.tsx and is literally the same component Settings renders.
 * `<Select>` is Settings' own class string, named once, with `appearance-none` and a chevron in place
 * of the platform arrow — the one half of the instruction Settings could not supply, because every
 * select on that page is native. That is recorded in the report as the one thing with no existing
 * equivalent, and the primitive's own comment carries the reasoning.
 *
 * ⛔ NOTHING IN THIS FILE MAY DEFINE A CONTROL LOOK AGAIN. scripts/event-types.cjs asserts that the
 * two components are imported and that no local switch or select class survives here.
 *
 * ── FADED IS THE PRIMITIVE'S OWN PROP ─────────────────────────────────────────────────────────────
 * 🔴 `faded` ON <Toggle> AND <Select>, not a class string here. A faded control is what "follows
 * Standard" looks like and it is the ONLY signal — no label beside it, no option inside the dropdown,
 * no link under it (the brief: "no other wording on the controls"). One prop, one definition,
 * identical on both control kinds.
 */

/**
 * One type's control for one row.
 *
 * ── 🔴 A NULL SETTING SHOWS WHAT IT INHERITS, FADED. NOTHING SAYS "Same as Standard" ─────────────
 * This replaced the whole of the stage-2b scheme: "Same as Standard" as the first option of every
 * dropdown, and for a switch a greyed control with those words beside it plus a link back to NULL.
 * Three affordances for one idea, and the dropdown option was the worst of them — it made the
 * operator read a cross-reference instead of a setting, then look across the table to find out what
 * it meant.
 *
 * Now the control shows THE VALUE THAT WILL BE USED, faded, through the shared primitives' own
 * `faded` prop. Touching it stores that type's own value and the control comes up to full strength.
 * The way back to inheriting is **Match Standard** in the type's ⋯ menu, which clears every row.
 *
 * ⚠️ RE-PICKING THE IDENTICAL VALUE IN A FADED DROPDOWN DOES NOT STORE IT, because a <select> fires
 * no change event when the selection does not change. So a type cannot be given an explicit value
 * that happens to equal Standard's by using the dropdown — it would have to be set to something else
 * and back. A known limit, and the lesser evil: the alternative is committing on focus, which turns
 * tabbing through the table into a dozen silent writes.
 */
function TypeControl({ row, type, standard, editable, onPatch }: {
  row: ServiceRow
  type: TypeRow
  standard: StandardValues
  editable: boolean
  onPatch: (values: Record<string, unknown>) => void
}) {
  const own = rowIsOwn(row, type)
  /* ── ⛔ NO "Varies by van", NO "Set per van", NO "Same as Standard". EVERY CELL IS A REAL SETTING ──
   * Dominic, 4 October 2026: "REMOVE 'VARIES BY VAN' COMPLETELY. Every cell is a real setting: a
   * switch that is on or off, or a dropdown showing a real value."
   *
   * Three passes of this build each had a phrase here instead of a value — "Same as Standard" as a
   * dropdown option, then "Set per van" as text with a link, then "Varies by van" as an option again.
   * All three answered "what will happen at this event?" with a cross-reference.
   *
   * 🔴 SO AN INHERITING CELL SHOWS THE FIRST VAN'S VALUE, FADED. `standardValue` is already the first
   * van's value — the route's `distinct()` takes `pick(vanRows[0])`, and the vans arrive oldest-first
   * — so "the first van's value" needs no new plumbing, and where the vans AGREE it is simply the
   * truck's value, which is what the agree case always showed.
   * ⚠️ THE TITLE CARRIES THE NUANCE THE CELL CANNOT. Where the vans differ, this control is showing
   * ONE van's value and the others may differ; `TYPE_FOLLOWS_VAN_TITLE` says that, without claiming a
   * number the screen has no room for. Where they agree it is still true and still harmless.
   * 🔴 TOUCHING IT SETS AN EXPLICIT VALUE FOR EVERY VAN at events of this type, which is what a type's
   * column has always meant — the branch below is unchanged in that respect.
   */
  const inheritTitle = own ? undefined : TYPE_FOLLOWS_VAN_TITLE

  if (row.kind === 'interval') {
    const shown = type.collection_interval_mins
      ?? (standardIsPerVan(row, standard) ? TYPE_INTERVAL_CHOICES[0] : standard.collection_interval_mins.value)
    return (
      <Select className="flex-1" ariaLabel={`${row.label} for ${type.name}`} disabled={!editable}
        value={String(shown)} faded={!own} title={inheritTitle ?? `Every ${shown} min`}
        options={TYPE_INTERVAL_CHOICES.map(n => ({ value: String(n), label: `Every ${n} min` }))}
        onChange={v => onPatch({ collection_interval_mins: Number(v) })} />
    )
  }

  if (row.kind === 'offline') {
    const v = offlineValue(type, standard)
    return (
      <Select className="flex-1" ariaLabel={`${row.label} for ${type.name}`} disabled={!editable}
        value={v} faded={!own}
        title={inheritTitle ?? OFFLINE_CHOICES.find(c => c.value === v)?.label ?? ''}
        options={OFFLINE_CHOICES.map(c => ({ value: c.value, label: c.label }))}
        onChange={v2 => onPatch(offlinePatch(v2))} />
    )
  }

  // ── A SWITCH ──────────────────────────────────────────────────────────────────────────────────
  const key = row.keys[0]
  const stored = (type as unknown as Record<string, unknown>)[key] as boolean | null | undefined
  const explicit = stored === true || stored === false
  /* While inheriting, the position shown is STANDARD'S — the value that will be used. */
  const shown = explicit ? stored === true : standardSwitchValue(row, standard)

  return (
    <Toggle on={shown} faded={!explicit} disabled={!editable}
      ariaLabel={`${row.label} for ${type.name}`} title={inheritTitle}
      /* ⚠️ TAPPING A FADED SWITCH STORES THE OPPOSITE OF WHAT IT SHOWS, which is what a switch does.
       * It is showing Standard's position; tapping it means "no, for this type, the other one". */
      onToggle={() => onPatch({ [key]: !shown })} />
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1b · THE PHONE CARDS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Standard on a phone — one van's column, or the combined one.
 *
 * 🔴 EDITABLE HERE TOO, THROUGH THE SAME `OneStandardControl`. A phone showing a read-only Standard
 * while the tablet layout showed an editable one would be two different products; and the footer's
 * promise ("changing it here also changes it in Settings") has to hold at every width.
 *
 * 🔴 ONE VAN'S COLUMN WHEN THE PICKER NAMES A VAN. The picker lists the van columns and then the
 * types, in the grid's order — so picking "Festival trailer" on a phone is picking the same column
 * that sits second on a tablet, and its controls write that van alone.
 * ⚠️ A TRUCK-LEVEL ROW STILL WRITES THE TRUCK even inside a van's card, because there is nothing
 * per-van to write. It is labelled so, rather than silently behaving differently from its neighbours.
 */
function StandardCard({ standard, van, editable, onStandard, onStandardVan, standardBusy }: {
  standard: StandardValues
  /** The van whose column this is, or null for the combined Standard column. */
  van: VanRow | null
  editable: boolean
  onStandard: (row: ServiceRow, value: boolean | number | string) => void
  onStandardVan: (row: ServiceRow, vanId: string, value: boolean | number | string) => void
  standardBusy: boolean
}) {
  const canEdit = editable && !standardBusy
  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Dot colour={STANDARD_COLOUR} />
        <p className="font-bold text-slate-900 min-w-0 flex-1 truncate">{van ? van.name : 'Standard'}</p>
        <span className="text-xs text-slate-400 shrink-0">{van ? 'Standard' : 'default'}</span>
      </div>
      <p className="text-xs text-slate-500">
        {van
          ? `This van's usual setup — used at every event with no type.`
          : 'Your usual setup — used at every event with no type.'}
      </p>
      {SERVICE_ROWS.map(row => {
        const truckLevel = standardWriteFor(row, false)?.scope === 'truck'
        /* A van's card shows that van's value; the combined card shows the aggregate. A truck-level
         * row has only the one value either way. */
        const value = van && !truckLevel ? vanValue(row, van) : standardValue(row, standard)
        return (
          <div key={row.id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-t border-slate-100">
            <span className="text-slate-700 min-w-0 flex-1">
              {row.label}
              {van && truckLevel && (
                /* ⚠️ SAID OUT LOUD. Inside a van's card, this one row is not about that van. */
                <span className="block text-[11px] text-slate-400">Applies to the whole truck</span>
              )}
            </span>
            <span className="flex items-center gap-2 shrink-0 max-w-[55%]">
              <OneStandardControl row={row} editable={canEdit} value={value}
                label={`${row.label} for ${van && !truckLevel ? van.name : 'Standard'}`}
                onChange={v => (van && !truckLevel ? onStandardVan(row, van.id, v) : onStandard(row, v))} />
            </span>
          </div>
        )
      })}
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
      {/* ⚠️ THE "Standard: Off" HINT BESIDE EACH LABEL IS GONE. The control itself now shows the value
        * it inherits, so the hint was the same information twice — and on a phone it was the line that
        * pushed the label into wrapping. */}
      {SERVICE_ROWS.map(row => (
        <div key={row.id} className="py-1.5 border-t border-slate-100">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-slate-600">{row.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <TypeControl row={row} type={type} standard={standard} editable={editable} onPatch={onPatch} />
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

        {/* ⚠️ THE SHARED <Input>. It was a local box with its own border, radius, height and text
          * size — `border-slate-300 rounded-xl px-3 h-11 text-[15px]` — none of which matches the
          * Manage text boxes behind it. The cap and the autofocus travel as props. */}
        <Input label="Name" value={name} onChange={setName} placeholder="e.g. School fete"
          maxLength={MAX_TYPE_NAME} inputRef={inputRef} />

        <div className="flex flex-wrap gap-2">
          {TYPE_NAME_CHIPS.map(chip => (
            /* ⚠️ A CHIP SETS THE NAME FIELD, which stays editable — so "Festival" can become
             * "Festival (Saturday)" without retyping it. */
            /* ⚠️ `border-slate-200`, THE PAGE'S BORDER COLOUR. These were `border-slate-300`, one
             * step darker than every other border in Manage — a one-off that read as "selected".
             * A chip is not one of the four `Btn` colours (it is a pill that fills a field), so it
             * stays markup; what it must not do is invent its own border and text size. */
            <button key={chip} type="button" onClick={() => { setName(chip); inputRef.current?.focus() }}
              className="border border-slate-200 rounded-full px-3.5 h-10 text-sm font-semibold text-slate-900 bg-white hover:bg-slate-50">
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
