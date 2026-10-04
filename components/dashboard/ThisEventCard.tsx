'use client'
// components/dashboard/ThisEventCard.tsx — the "This event" card (Dashboard2 board).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 EVERY CONTROL IN THIS CARD IS FOR THIS EVENT ONLY
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Nothing here writes to `trucks`, to `truck_vans`, or to another event. Every row goes through a
// per-event action that already existed, writing a per-event override column or a per-event row:
//
//   Event type        → event-types `assign`         → truck_events.event_type_id
//   Stock/items sold  → the dashboard's STOCK TAB    → event_item_stock / event_category_stock
//   Deals             → `set_event_deal`             → event_deals, overridden = true
//   Buzzers           → `set_buzzer_prompt_override` → truck_events.buzzer_prompt
//   Take cash         → `set_takes_cash_override`    → truck_events.takes_cash_override
//   "Mark ready" step → `set_order_ready_override`   → truck_events.order_ready_override
//   Collection times  → `set_collection_intervals_override` → the two interval override columns
//   Offline protection→ `set_offline_protection`     → the three offline override columns
//
// ── 🔴 WHY THIS IS A SEPARATE FILE ────────────────────────────────────────────────────────────────
// docs/event-types-stage1-report.md §8.2: own files, one-line mounts. `app/dashboard/[token]/page.tsx`
// is ~6,000 lines and is the screen Pizzeria Gusto trades on; this card is mounted from one line in it
// and owns everything else, so the diff on that file stays readable and the merge stays small.
//
// ── ⛔ NO PRICES ROW ──────────────────────────────────────────────────────────────────────────────
// The Dashboard2 board shows one, with a "Prices for this event" sheet. Per-event prices are a LATER
// stage, built together with type prices, and there is no per-event price mechanism in the database at
// all (docs/event-types-investigation-report.md: `event_price_overrides` does not exist). A row that
// opened a sheet writing nothing would be worse than no row.

import { useCallback, useEffect, useState } from 'react'
/* ⚠️ THE MODE LABELS COME FROM `OFFLINE_PROTECTION_MODES` ITSELF, not as two separate constants —
 * the dropdown maps the array, so a wording change is one edit in that file and this surface cannot
 * drift from Settings › Kitchen. */
import {
  OFFLINE_PROTECTION_MODES,
  OFFLINE_AUTO_REJECT_LABEL, OFFLINE_AUTO_REJECT_OPTIONS, OFFLINE_AUTO_REJECT_DEFAULT_MINS,
  offlineAutoRejectLabel, OFFLINE_PROTECTION_EXPLAINER_LEAD, OFFLINE_PROTECTION_EXPLAINER_BODY,
  type OfflineProtectionMode,
} from '@/lib/copy/offlineProtection'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED BITS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** The "THIS EVENT" tag. Blue, small, and it means "you changed this here". */
const OwnTag = () => (
  <span className="text-[10px] font-bold text-blue-700 bg-blue-100 rounded px-1.5 py-px shrink-0">THIS EVENT</span>
)

/** One row. 44px minimum, because every one of these is tapped mid-service. */
function Row({ label, hint, own, children }: {
  label: string
  hint?: string | null
  own?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5 py-2.5 border-t border-slate-100 min-h-[44px]">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-slate-800">{label}</p>
        {hint && <p className="text-[13px] text-slate-500 font-normal">{hint}</p>}
      </div>
      {own && <OwnTag />}
      {children}
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold tracking-[0.06em] text-slate-500 pt-3 pb-0.5">{children}</p>
  )
}

/** The dashboard's switch shape, local so this file needs nothing from the page it mounts in. */
function Switch({ on, onToggle, disabled, label }: {
  on: boolean; onToggle: () => void; disabled?: boolean; label: string
}) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={onToggle}
      className={`relative w-[42px] h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
        on ? 'bg-orange-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
        on ? 'translate-x-[21px]' : 'translate-x-[3px]'}`} />
    </button>
  )
}

/**
 * ── 🔴 `max-w-[58%]` AND NO `shrink-0`, AND A PHONE IS WHY ────────────────────────────────────────
 * A `<select>` sizes itself to its WIDEST OPTION, and the offline row's widest is "Keep taking orders,
 * confirm them yourself". With `shrink-0` that select was 320px inside a 358px card at 390px wide, so
 * the card scrolled sideways and the control hung off the edge — measured in both engines by
 * scripts/event-types-render.cjs, which is how it was found.
 * Letting it shrink, with a cap, keeps it inside the card at every width; the browser truncates the
 * shown label and the full text is still in the open list. The label beside it keeps the rest.
 */
const SELECT = 'border border-slate-300 rounded-xl px-2.5 h-10 text-sm font-semibold text-slate-900 bg-white min-w-0 max-w-[58%]'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE CARD
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface ThisEventDeal { id: string; name: string; active: boolean; own: boolean }

export interface ThisEventCardProps {
  /** null hides the whole card — there is no "this event" without one. */
  eventId: string | null
  /** The truck's types. Empty ⇒ the Event type row is not shown, and the card still is. */
  types: { id: string; name: string }[]
  currentTypeId: string | null
  /** Called with the chosen type id (or null for Standard) and whether to clear hand changes. */
  onAssignType: (typeId: string | null, clearOwn: boolean) => Promise<void>

  /** SERVICE — the resolved values the page already computes, and the per-event writers. */
  buzzerCount: number | null
  buzzerPrompt: boolean
  onBuzzerPrompt: (v: boolean) => void
  buzzerPromptOwn: boolean

  takesCash: boolean
  onTakesCash: (v: boolean) => void
  takesCashOwn: boolean

  orderReady: boolean
  onOrderReady: (v: boolean) => void
  orderReadyOwn: boolean

  collectionMins: number
  /**
   * ── 🔴 THIS ROW LINKS TO THE EXISTING CONTROL; IT DOES NOT REPLACE IT ──────────────────────────
   * The Kitchen tab's collection-times box offers THREE things: the customer grid, an operator-only
   * override behind a tickbox, and "Use my usual setting" — the only route back to following the van.
   * One card row cannot express that, and a row that offered only the customer half would be a second
   * editor for a PAIR the existing box's own comments insist is always written together
   * ("EVERY CHANGE WRITES BOTH EVENT COLUMNS"). Two editors disagreeing about the operator grid is
   * exactly what those comments exist to prevent.
   * So the row shows the value in force and hands over, the same way the MENU row hands over to the
   * stock screen. Nothing is duplicated and nothing is lost.
   */
  onOpenCollection: () => void
  collectionOwn: boolean

  offlineEnabled: boolean
  offlineMode: OfflineProtectionMode
  offlineAutoRejectMins: number | null
  onOffline: (v: { enabled?: boolean; mode?: OfflineProtectionMode; autoRejectMins?: number }) => void
  offlineOwn: boolean

  /** MENU — the existing per-event stock screen. */
  stockSummary: string | null
  onOpenStock: () => void

  /** DEALS. */
  deals: ThisEventDeal[]
  onDeal: (bundleId: string, active: boolean) => void

  /** Clears only what this card controls. */
  onResetToType: () => void

  disabled?: boolean
  /**
   * Any per-event write in flight.
   *
   * ⚠️ ONE FLAG FOR THE CARD, NOT ONE PER ROW. Each moved control had its own "Saving…" text beside
   * its own toggle; five flags threaded through as five props would be five props to say one thing,
   * and the writes are fast enough that the operator reads this as "the card is busy". The affordance
   * is kept rather than dropped because it was there before the move.
   */
  saving?: boolean
  /** A demo truck sees the controls and cannot arm offline protection — the page's existing rule. */
  isDemo?: boolean
}

export function ThisEventCard(props: ThisEventCardProps) {
  const {
    eventId, types, currentTypeId, onAssignType,
    buzzerCount, buzzerPrompt, onBuzzerPrompt, buzzerPromptOwn,
    takesCash, onTakesCash, takesCashOwn,
    orderReady, onOrderReady, orderReadyOwn,
    collectionMins, onOpenCollection, collectionOwn,
    offlineEnabled, offlineMode, offlineAutoRejectMins, onOffline, offlineOwn,
    stockSummary, onOpenStock, deals, onDeal, onResetToType, disabled, saving, isDemo,
  } = props

  const [pending, setPending] = useState<string | null | undefined>(undefined)
  const [clearOwn, setClearOwn] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!eventId) return null

  const typeName = types.find(t => t.id === currentTypeId)?.name ?? 'Standard'

  /* ── 🔴 THE COUNT AND THE RESET BUTTON COUNT THE SAME THINGS ──────────────────────────────────
   * Every flag here is a hand change on a row THIS CARD controls, and "Reset to <type>" clears
   * exactly those. A count that included something the button could not clear would promise a reset
   * that leaves a tag behind.
   * ⚠️ DEALS ARE COUNTED TOO, because a per-event deal row (`overridden = true`) is a hand change on
   * this event in exactly the same sense — and the reset clears them. */
  const ownFlags = [buzzerPromptOwn, takesCashOwn, orderReadyOwn, collectionOwn, offlineOwn]
  const ownCount = ownFlags.filter(Boolean).length + deals.filter(d => d.own).length

  const commitType = async () => {
    setBusy(true)
    try { await onAssignType(pending ?? null, clearOwn); setPending(undefined); setClearOwn(false) }
    finally { setBusy(false) }
  }

  const targetName = pending === undefined ? '' : (types.find(t => t.id === pending)?.name ?? 'Standard')

  return (
    <div data-this-event-card className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-3 pb-1">
        <p className="font-bold text-slate-900 text-base flex-1">This event</p>
        {saving && <p className="text-xs text-slate-400 animate-pulse shrink-0">Saving…</p>}
        <p className="text-[13px] text-slate-500">Changes here are for this event only</p>
      </div>

      {/* ── EVENT TYPE — only when the truck has types ──────────────────────────────────────────
        * 🔴 THE CARD SHOWS FOR EVERY TRUCK; THIS ROW DOES NOT. A truck with no event types has
        * nothing to choose, and a select with one option would teach them nothing while taking a row
        * of a card they use mid-service. */}
      {types.length > 0 && (
        <Row label="Event type">
          <select aria-label="Event type" value={currentTypeId ?? ''} disabled={disabled || busy}
            onChange={e => { setClearOwn(false); setPending(e.target.value || null) }}
            className={SELECT}>
            <option value="">Standard</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Row>
      )}

      {/* ── MENU ──────────────────────────────────────────────────────────────────────────────── */}
      <SectionHeading>MENU</SectionHeading>
      {/* 🔴 IT OPENS THE EXISTING PER-EVENT STOCK SCREEN rather than reimplementing it. That screen
        * is the dashboard's Stock tab, it already writes `event_item_stock` / `event_category_stock`
        * for the selected event, and it already handles the offline outbox. */}
      <Row label="Stock and items sold" hint={stockSummary ?? 'Set how much you have, and what you are not selling'}>
        <button type="button" onClick={onOpenStock} disabled={disabled}
          className="text-sm font-semibold text-orange-700 disabled:text-slate-300 shrink-0">Change</button>
      </Row>

      {/* ── DEALS ─────────────────────────────────────────────────────────────────────────────── */}
      {deals.length > 0 && (
        <>
          <SectionHeading>DEALS</SectionHeading>
          {deals.map(d => (
            <Row key={d.id} label={d.name} own={d.own}>
              <Switch label={d.name} on={d.active} disabled={disabled}
                onToggle={() => onDeal(d.id, !d.active)} />
            </Row>
          ))}
        </>
      )}

      {/* ── SERVICE ───────────────────────────────────────────────────────────────────────────── */}
      <SectionHeading>SERVICE</SectionHeading>

      {/* ⚠️ BUZZERS ONLY APPEAR WHERE THERE IS A RACK. `buzzer_count` null means this van has none, so
        * there is nothing a prompt could ask for — lib/buzzer.ts returns early on exactly that. */}
      {buzzerCount !== null && (
        <Row label="Buzzers" own={buzzerPromptOwn}>
          <Switch label="Buzzers" on={buzzerPrompt} disabled={disabled}
            onToggle={() => onBuzzerPrompt(!buzzerPrompt)} />
        </Row>
      )}

      <Row label="Take cash" own={takesCashOwn}>
        <Switch label="Take cash" on={takesCash} disabled={disabled}
          onToggle={() => onTakesCash(!takesCash)} />
      </Row>

      <Row label="“Mark ready” step" own={orderReadyOwn}>
        <Switch label="Mark ready step" on={orderReady} disabled={disabled}
          onToggle={() => onOrderReady(!orderReady)} />
      </Row>

      <Row label="Collection times" hint={`Every ${collectionMins} min`} own={collectionOwn}>
        <button type="button" onClick={onOpenCollection} disabled={disabled}
          className="text-sm font-semibold text-orange-700 disabled:text-slate-300 shrink-0">Change</button>
      </Row>

      {/* ── OFFLINE PROTECTION ─────────────────────────────────────────────────────────────────
        * 🔴 MOVED HERE FROM THE DASHBOARD'S SETTINGS TAB, not duplicated — it was already a per-event
        * control (it writes `offline_protection_override`), so it belongs in the card of per-event
        * controls. The Settings tab's copy of it is removed in the same change.
        * 🔴 THE ⚠️ INSTRUCTION TRAVELS WITH IT. lib/copy/offlineProtection.ts calls it a
        * safety-critical instruction, and a compressed row that dropped it would be the one
        * simplification in this card that costs an operator a service. It shows whenever protection
        * is on, which is when it applies.
        * ⚠️ THE MODE IS A DROPDOWN HERE, NOT TWO RADIOS. The Settings card has room for two radios with
        * help text; this card has one row per setting, and the Dashboard2 board shows a dropdown. The
        * values and their labels are the SAME constants, so the two surfaces cannot word them
        * differently. */}
      <Row label="Offline protection" own={offlineOwn}>
        <select aria-label="Offline protection" disabled={disabled || isDemo}
          value={!offlineEnabled ? 'off' : offlineMode}
          onChange={e => {
            const v = e.target.value
            if (v === 'off') onOffline({ enabled: false })
            else onOffline({ enabled: true, mode: v as OfflineProtectionMode })
          }}
          className={SELECT}>
          <option value="off">Off</option>
          {OFFLINE_PROTECTION_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </Row>
      {offlineEnabled && !isDemo && (
        <p className="text-[13px] text-amber-600 -mt-1 pb-1.5">
          ⚠️ <strong>{OFFLINE_PROTECTION_EXPLAINER_LEAD}</strong> {OFFLINE_PROTECTION_EXPLAINER_BODY}
        </p>
      )}
      {/* 🔴 THE DELAY IS REQUIRED BY THIS MODE AND HAS NO "OFF" — lib/copy/offlineProtection.ts says
        * why: without one an order can sit indefinitely while the customer is never told it was not
        * accepted. It is indented under the row it belongs to, as Settings indents it under its own. */}
      {offlineEnabled && offlineMode === 'no_auto_accept' && (
        <div className="flex items-center justify-between gap-3 pl-4 pb-2">
          <p className="text-[13px] font-semibold text-slate-700">{OFFLINE_AUTO_REJECT_LABEL}</p>
          <select aria-label={OFFLINE_AUTO_REJECT_LABEL} disabled={disabled}
            value={offlineAutoRejectMins ?? OFFLINE_AUTO_REJECT_DEFAULT_MINS}
            onChange={e => onOffline({ autoRejectMins: Number(e.target.value) })}
            className="border border-slate-300 rounded-lg px-2 h-9 text-sm bg-white">
            {OFFLINE_AUTO_REJECT_OPTIONS.map(n => <option key={n} value={n}>{offlineAutoRejectLabel(n)}</option>)}
          </select>
        </div>
      )}

      {/* ── THE FOOTER ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 py-2.5 border-t border-slate-100">
        <p className="text-[13px] text-slate-500 flex-1">
          {ownCount === 0
            ? `Everything here is coming from ${typeName}.`
            : `${ownCount} setting${ownCount === 1 ? '' : 's'} changed for this event only.`}
        </p>
        {ownCount > 0 && (
          <button type="button" onClick={onResetToType} disabled={disabled}
            className="text-sm font-semibold text-orange-700 disabled:text-slate-300 shrink-0">
            Reset to {typeName}
          </button>
        )}
      </div>

      {/* ── THE TYPE-SWITCH CONFIRM ───────────────────────────────────────────────────────────── */}
      {pending !== undefined && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget && !busy) setPending(undefined) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" role="dialog" aria-modal="true">
            <p className="font-bold text-slate-900 text-lg">Switch this event to {targetName}?</p>
            <div className="text-sm text-slate-700 space-y-1">
              <p>• New orders use {targetName}’s service settings.</p>
              {/* ⚠️ SAID EVEN THOUGH THIS BUILD CHANGES NO PRICES: it is the question a truck asks when
                * switching a LIVE event's type, and it is true now by construction — nothing in this
                * card or this feature writes to the orders table, and a placed order's prices are the
                * ones stored on it (lib/order-repricing.ts). */}
              <p>• Orders already placed keep their prices.</p>
              <p>{ownCount > 0
                ? `• Your ${ownCount} change${ownCount === 1 ? '' : 's'} for this event stay.`
                : '• You haven’t changed anything on this event.'}</p>
            </div>
            {ownCount > 0 && (
              <label className="flex gap-2 items-start text-sm text-slate-700">
                <input type="checkbox" checked={clearOwn} onChange={e => setClearOwn(e.target.checked)} className="mt-0.5" />
                <span>Clear my changes and use {targetName} exactly</span>
              </label>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setPending(undefined)} disabled={busy}
                className="bg-slate-100 text-slate-700 text-sm px-4 py-2 font-bold rounded-xl">Cancel</button>
              <button type="button" onClick={() => void commitType()} disabled={busy}
                className="bg-orange-600 text-white text-sm px-4 py-2 font-bold rounded-xl disabled:opacity-50">
                {busy ? 'Switching…' : `Switch to ${targetName}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE DEALS HOOK — one read, when the card mounts or the event changes
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * This event's deals, with optimistic toggling.
 *
 * ⚠️ IT IS NOT ON THE DASHBOARD POLL. The deal list changes only when the operator touches it, so a
 * join on every ~15s tick would be work for data that almost never moves. `get_event_deals` is called
 * when the event changes and after a write.
 * ⚠️ OPTIMISTIC, THEN RE-READ. A switch that waited for the round trip reads as broken on a van's
 * connection; a failed write is corrected by the re-read and surfaced by the caller's own toast.
 */
export function useEventDeals(
  post: (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>,
  eventId: string | null,
) {
  const [deals, setDeals] = useState<ThisEventDeal[]>([])

  const reload = useCallback(async () => {
    if (!eventId) { setDeals([]); return }
    const r = await post({ action: 'get_event_deals', eventId })
    if (r && Array.isArray(r.deals)) setDeals(r.deals as ThisEventDeal[])
  }, [post, eventId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload() }, [reload])

  const setDeal = useCallback(async (bundleId: string, active: boolean) => {
    setDeals(prev => prev.map(d => d.id === bundleId ? { ...d, active, own: true } : d))
    await post({ action: 'set_event_deal', eventId, bundleId, active })
    await reload()
  }, [post, eventId, reload])

  return { deals, setDeal, reloadDeals: reload }
}
