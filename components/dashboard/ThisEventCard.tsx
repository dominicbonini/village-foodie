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
// ── ✅ THE PRICES ROW (§70, 5 October 2026) ──────────────────────────────────────────────────────
//   Prices           → `save_event_pricing` / `clear_event_pricing` → truck_events.price_* +
//                      event_item_prices rows for THIS event
//
// 🔴 THIS BLOCK USED TO SAY "NO PRICES ROW", and that was right until this build: there was no
// per-event price mechanism in the database at all. There is one now — `truck_events.price_own` plus
// `event_item_prices` (20261011) — and the row opens `<EventPricesSheet>`, which writes them.
// ⚠️ THE OLD NOTE ALSO SAID `event_price_overrides` DOES NOT EXIST. It DOES exist in production: 0
// rows, read by no code path, unused legacy. It is NOT what this feature writes and it was NOT
// dropped — see §70.2 of the manual. Corrected here rather than left adjacent, which is §37's rule.

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
/* 🔴 THE LABELS, FROM WHERE SETTINGS, THE GRID AND THIS CARD ALL GET THEM. */
import {
  SERVICE_SETTING_LABELS, PRICES_ROW_LABEL, OFFLINE_WHEN_OFFLINE_LABEL,
} from '@/lib/copy/serviceSettings'
/* 🔴 THE DASHBOARD'S OWN SWITCH, AND THE APP'S CONTROL BOX. Neither is defined in this file. */
import { Toggle } from '@/components/dashboard/OrderCard'
import { CONTROL_BOX, ORANGE_SOLID } from '@/lib/ui-tokens'
/* 🔴 PRIVATE EVENTS (20261014). The words from the one copy module; the name from the one resolver. */
import {
  PRIVATE_CHIP, LINK_QR_BUTTON, CONFIRM_TO_PRIVATE, CONFIRM_FROM_PRIVATE,
} from '@/lib/private-events/copy'
import { privateDisplayName } from '@/lib/private-events/resolve'

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
/* ── 🔴 THIS CARD'S OWN SWITCH IS GONE. IT WAS THE ODD ONE OUT ON ITS OWN SCREEN ─────────────
 * Dominic, 4 October 2026: "Do the same for the dashboard 'This event' card if any control there
 * differs from the dashboard's existing controls." It did. This file had written a switch at
 * `w-[42px] h-6` with an 18px knob and `bg-orange-600` for ON, while BOTH dashboard surfaces behind
 * it — `components/dashboard/OrderCard.tsx`'s exported `Toggle` and the keep-screen-on switch on
 * `app/dashboard/[token]/page.tsx` — are `w-11 h-6` with a 16px knob and `bg-green-500`.
 * So three switches existed where the product has one, and this card's was the only orange one.
 *
 * 🔴 IT NOW RENDERS `OrderCard`'s `Toggle`, which gained an optional `ariaLabel` for the purpose.
 * `Switch` is kept as a thin local alias so the five call sites below read unchanged, and so the
 * name in this file still says what it is. */
function Switch({ on, onToggle, disabled, label }: {
  on: boolean; onToggle: () => void; disabled?: boolean; label: string
}) {
  return <Toggle on={on} onToggle={onToggle} disabled={disabled} ariaLabel={label} />
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
/* ⚠️ THE BOX IS `CONTROL_BOX` NOW — the string that appears six times inline on the dashboard page
 * and eight times in Manage (lib/ui-tokens.ts). This was `border-slate-300 rounded-xl px-2.5 h-10
 * font-semibold`: a darker border, a rounder corner and a bolder weight than any other dropdown on
 * the screen.
 * 🔴 `h-10` AND `max-w-[58%]` SURVIVE, AND THE NOTE ABOVE EXPLAINS WHY — the width is what stops a
 * <select> sizing itself to "Keep taking orders, confirm them yourself" and pushing the row's label
 * off a phone. The token deliberately carries no size, so callers add their own. */
const SELECT = `${CONTROL_BOX} h-10 min-w-0 max-w-[58%]`

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE CARD
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface ThisEventDeal { id: string; name: string; active: boolean; own: boolean }

export interface ThisEventCardProps {
  /** null hides the whole card — there is no "this event" without one. */
  eventId: string | null
  /** The truck's types, in the grid's order (Private first). Empty ⇒ the Event type row is not shown,
   *  and the card still is.
   *  ⚠️ `kind` ADDED 20261015 so the confirm can tell a switch into/out of PRIVATE from any other
   *  switch. Optional, and absent reads as 'custom' — which is what every type was before 20261014. */
  types: { id: string; name: string; kind?: 'custom' | 'private' }[]
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

  /**
   * MENU — PRICES (§70).
   *
   * 🔴 `pricesSummary` IS COMPUTED ON THE SERVER, by `summarisePricing` over the SAME
   * `readEventPricing` call `loadEventPriceBook` uses to price an order
   * (/api/event-types `event_pricing_summary`). So this card's one line and the next customer's
   * charge come from one read of one pair of columns. It is deliberately NOT derived here from
   * separate flags: that is how a card comes to promise "+10%" on an event charging menu prices.
   * `pricesOwn` drives the THIS EVENT tag AND the footer count.
   */
  pricesSummary: string
  pricesOwn: boolean
  onOpenPrices: () => void
  /**
   * 🔴 FALSE ⇒ 20261011 IS NOT APPLIED, AND THE BUTTON IS **VISIBLY** DISABLED, not silently inert.
   * The row itself still shows and still reads "Menu prices", which is TRUE in that state — every
   * order is charged the menu price — so there is nothing to hide. What must not happen is a live-
   * looking "Change" that does nothing when pressed: an operator would press it twice and conclude
   * the dashboard is broken. A disabled control says "not yet" in the one way nobody misreads.
   */
  pricesReady?: boolean

  /**
   * ── 🔴 PRIVATE EVENTS (20261014) ──────────────────────────────────────────────────────────────
   * `isPrivate` is read straight off the event (`truck_events.is_private`), never derived from the
   * type — the type's FK is ON DELETE SET NULL and would publish a wedding if the Private type were
   * ever removed.
   * `privateName` is the operator's name for it; `onOpenPrivateLink` opens the shared Link & QR panel.
   * ⚠️ ALL OPTIONAL, AND ABSENT MEANS "not private" — so every existing render of this card is
   * unchanged and the row is simply not drawn.
   */
  isPrivate?: boolean
  privateName?: string | null
  onOpenPrivateLink?: () => void

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
    stockSummary, onOpenStock, pricesSummary, pricesOwn, onOpenPrices, pricesReady = true,
    isPrivate, privateName, onOpenPrivateLink,
    deals, onDeal, onResetToType, disabled, saving, isDemo,
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
  /* ⚠️ `pricesOwn` IS IN THE LIST, AND IT HAS TO BE. "N settings changed for this event only" and
   * "Reset to <type>" count the SAME things by rule, and `assign` with `clearOwn: true` — which is
   * what Reset sends — now clears the event's price columns AND its typed rows. A count that left
   * prices out would under-report while the button over-delivered. */
  const ownFlags = [buzzerPromptOwn, takesCashOwn, orderReadyOwn, collectionOwn, offlineOwn, pricesOwn]
  const ownCount = ownFlags.filter(Boolean).length + deals.filter(d => d.own).length

  const commitType = async () => {
    setBusy(true)
    try { await onAssignType(pending ?? null, clearOwn); setPending(undefined); setClearOwn(false) }
    finally { setBusy(false) }
  }

  const targetName = pending === undefined ? '' : (types.find(t => t.id === pending)?.name ?? 'Standard')
  /* ── 🔴 IS THIS SWITCH CROSSING THE PRIVACY LINE? (5 October 2026) ──────────────────────────────
   * ⚠️ DECIDED FROM `isPrivate` (the EVENT's own `truck_events.is_private`) AND the TARGET's kind —
   * never from the current type's kind, because an event can be private while its type row is being
   * read, and `is_private` is the source of truth either way (§73).
   * ⚠️ `pending === undefined` IS "NO SWITCH PENDING", so both are false and neither sentence shows. */
  const targetIsPrivate = pending !== undefined && !!pending
    && types.find(t => t.id === pending)?.kind === 'private'
  const toPrivate = pending !== undefined && targetIsPrivate && !isPrivate
  const fromPrivate = pending !== undefined && !targetIsPrivate && !!isPrivate

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
          {/* ══ 🔴 PRIVATE IS ONE OF THE CHOICES HERE TOO (5 October 2026) ═══════════════════════
            * The list comes from the route in the grid's order — Standard, then Private, then the
            * truck's own types — so the same three screens offer the same choice in the same order.
            * ⛔ AND SWITCHING INTO OR OUT OF PRIVATE CONFIRMS, with words about what the PUBLIC sees
            * rather than about columns. Both directions are visible to customers on the next request:
            * into Private drops the event off the map, out of it publishes the address and kills the
            * link. Neither has a draft state to undo in, which is why neither is a toast. */}
          <select aria-label="Event type" value={currentTypeId ?? ''} disabled={disabled || busy}
            onChange={e => { setClearOwn(false); setPending(e.target.value || null) }}
            className={SELECT}>
            <option value="">Standard</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Row>
      )}

      {/* ── 🔴 PRIVATE — ABOVE MENU, BECAUSE IT IS ABOUT WHO CAN ORDER AT ALL (20261014) ───────
        * Drawn only for a private event. The hint is the operator's name for it, or the generic
        * label; the action opens the same Link & QR panel the Events list opens.
        * ⚠️ IT SITS WITH THE EVENT'S OWN FACTS, ABOVE MENU, rather than under it: whether guests can
        * reach this event at all comes before what is on the menu when they do.
        * ⚠️ `own` IS NOT PASSED. That marker means "this event has a hand-set value overriding its
        * type"; being private is not an override of anything — it is what the event IS. */}
      {isPrivate && (
        <Row label={PRIVATE_CHIP} hint={privateDisplayName(privateName)}>
          <button type="button" onClick={onOpenPrivateLink} disabled={disabled || !onOpenPrivateLink}
            data-open-private-link
            className="text-sm font-semibold text-purple-700 disabled:text-slate-300 shrink-0">
            {LINK_QR_BUTTON}
          </button>
        </Row>
      )}

      {/* ── MENU ──────────────────────────────────────────────────────────────────────────────── */}
      <SectionHeading>MENU</SectionHeading>
      {/* ── 🔴 PRICES, FIRST UNDER MENU (§70) ─────────────────────────────────────────────────────
        * Above stock deliberately: an operator arriving at a festival sets prices once, before
        * service, and checks stock repeatedly during it — but the price is the thing they must not
        * forget, because a wrong one is charged to a customer and a wrong stock figure only pauses a
        * dish. ⚠️ THE SUMMARY IS COMPUTED BY THE PAGE from the same pricing read the order path uses,
        * never from a second expression in this file. */}
      <Row label={PRICES_ROW_LABEL} hint={pricesSummary} own={pricesOwn}>
        <button type="button" onClick={onOpenPrices} disabled={disabled || !pricesReady} data-open-prices
          /* ⚠️ `title` ONLY WHEN IT IS THE MIGRATION STOPPING IT, so a disabled-because-offline button
           * does not claim a reason that is not its own. */
          title={!pricesReady ? 'Prices for one event aren’t switched on yet.' : undefined}
          className="text-sm font-semibold text-orange-700 disabled:text-slate-300 shrink-0">Change</button>
      </Row>
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

      {/* ── 🔴 THE SAME FIVE ROWS, IN THE SAME ORDER, UNDER THE SAME NAMES AS THE EVENT TYPES MODAL ──
        * Order and labels both come from `SERVICE_ROWS` (lib/event-types/types.ts) now. They were
        * hand-written here in a different sequence and under shorter names — 'Buzzers', 'Take cash',
        * 'Offline protection' — so the same five settings read one way on this card, another way in
        * the modal, and a third way in Settings. An operator who turns something off here and then
        * goes looking for it elsewhere was looking for a different phrase.
        * ⚠️ THE ROWS ARE STILL WRITTEN OUT, NOT GENERATED FROM THE ARRAY. Each has its own control, its
        * own `own` flag and its own condition (buzzers need a rack; offline carries two extra blocks),
        * and a loop over five special cases would be longer than the five. What comes from the array
        * is the ORDER and the WORDS, which are what drifted. scripts/event-types.cjs asserts the five
        * appear here in `SERVICE_ROWS`' order and that each label is the constant, not a literal. */}

      <Row label={SERVICE_SETTING_LABELS.collection_interval_mins} hint={`Every ${collectionMins} min`} own={collectionOwn}>
        <button type="button" onClick={onOpenCollection} disabled={disabled}
          className="text-sm font-semibold text-orange-700 disabled:text-slate-300 shrink-0">Change</button>
      </Row>

      <Row label={SERVICE_SETTING_LABELS.order_ready} own={orderReadyOwn}>
        <Switch label={SERVICE_SETTING_LABELS.order_ready} on={orderReady} disabled={disabled}
          onToggle={() => onOrderReady(!orderReady)} />
      </Row>

      <Row label={SERVICE_SETTING_LABELS.takes_cash} own={takesCashOwn}>
        <Switch label={SERVICE_SETTING_LABELS.takes_cash} on={takesCash} disabled={disabled}
          onToggle={() => onTakesCash(!takesCash)} />
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
      {/* ── 🔴 A SWITCH, WITH THE MODE UNDERNEATH WHEN IT IS ON (5 October 2026) ─────────────────
        * It was ONE three-choice `<select>` — Off / Pause ordering / Keep taking orders… — which made
        * this the only row on the card that was not a switch, and put a safety-critical MODE at the
        * same level as an on/off. The Event types grid changed the same way in the same build, so the
        * two surfaces still have the same shape as each other and as Settings › Kitchen (a switch,
        * then a mode when it is on).
        * ⚠️ THE SWITCH WRITES **ONLY** `enabled`, leaving the mode stored — turning protection back on
        * must not silently change what it will then do. That is `set_offline_protection`'s own
        * "optional and independent" contract, which is why this needed no route change. */}
      <Row label={SERVICE_SETTING_LABELS.offline_protection} own={offlineOwn}>
        <Switch label={SERVICE_SETTING_LABELS.offline_protection} on={offlineEnabled}
          disabled={disabled || isDemo}
          onToggle={() => onOffline({ enabled: !offlineEnabled })} />
      </Row>
      {offlineEnabled && !isDemo && (
        <div className="flex items-center justify-between gap-3 pl-4 pb-2">
          <p className="text-[13px] font-semibold text-slate-700">{OFFLINE_WHEN_OFFLINE_LABEL}</p>
          <select aria-label={OFFLINE_WHEN_OFFLINE_LABEL} disabled={disabled}
            value={offlineMode}
            onChange={e => onOffline({ mode: e.target.value as OfflineProtectionMode })}
            className={SELECT}>
            {OFFLINE_PROTECTION_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      )}
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

      {/* ⚠️ BUZZERS ONLY APPEAR WHERE THERE IS A RACK. `buzzer_count` null means this van has none, so
        * there is nothing a prompt could ask for — lib/buzzer.ts returns early on exactly that.
        * 🔴 LAST, NOT FIRST. It was the top row of this card and the top row of the modal, because the
        * rows had been written in the order the columns were added. It is the setting an operator
        * changes least and the one that matters least if it is wrong. */}
      {buzzerCount !== null && (
        <Row label={SERVICE_SETTING_LABELS.buzzer_prompt} own={buzzerPromptOwn}>
          <Switch label={SERVICE_SETTING_LABELS.buzzer_prompt} on={buzzerPrompt} disabled={disabled}
            onToggle={() => onBuzzerPrompt(!buzzerPrompt)} />
        </Row>
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
            {/* ══ 🔴 THE PRIVACY SENTENCE COMES FIRST, WHEN THE SWITCH CROSSES THAT LINE ═══════════
              * ⛔ ABOVE THE SERVICE BULLETS, DELIBERATELY. "New orders use Private's service settings"
              * is true and is not what the operator needs to read first; what the PUBLIC sees is.
              * ⚠️ IT APPEARS ONLY ON A CROSSING, not on every switch — Market → Festival says nothing
              * about privacy, and a sentence about the map on that switch would be noise.
              * 🔴 BOTH DIRECTIONS, BECAUSE BOTH ARE VISIBLE IMMEDIATELY: into Private the event drops
              * off the map; out of it the address publishes and the link stops working, including on
              * cards already printed. */}
            {toPrivate && (
              <p className="rounded-xl border border-purple-200 bg-purple-50 p-2.5 text-sm font-semibold text-purple-900">
                {CONFIRM_TO_PRIVATE}
              </p>
            )}
            {fromPrivate && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-sm font-semibold text-amber-900">
                {CONFIRM_FROM_PRIVATE}
              </p>
            )}
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
              {/* ⚠️ `ORANGE_SOLID` — the shared token (lib/ui-tokens.ts), which the dashboard's own `Btn`
                * palette uses for a primary action. It was a raw `bg-orange-600 text-white`, i.e. the
                * same colour with NO hover state, which the token supplies.
                * 🔴 NOT THE DASHBOARD'S `Btn` COMPONENT: that one is `flex-1 min-w-[72px] py-3`, built
                * for the order card's full-width action row, and would stretch a modal's button pair.
                * The COLOUR is shared; the geometry is this dialog's. */}
              <button type="button" onClick={() => void commitType()} disabled={busy}
                className={`${ORANGE_SOLID} text-sm px-4 py-2 font-bold rounded-xl disabled:opacity-50`}>
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
