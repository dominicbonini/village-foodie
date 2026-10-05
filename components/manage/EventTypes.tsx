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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
/* 🔴 THE SHARED CONTROLS. `Toggle` is the component page.tsx renders; `Select` is Settings' own
 * styling as a component. This file defines neither, by rule — see the note above TypeControl. */
import { Btn, Toggle, Select, Input } from './primitives'
/* 🔴 THE PRICE CONTROLS, FROM components/shared — THE SAME COMPONENTS THE DASHBOARD SHEET RENDERS.
 * Dominic, 5 October 2026: "Same controls, components and arithmetic as the grid — no second
 * implementation." The sheet is a dashboard surface, so they live one level up; that file's header
 * makes the argument. ⛔ NOTHING IN THIS FILE MAY DEFINE A PRICE CONTROL. */
/* ⚠️ `PRICE_TYPE_HINT` IS DELIBERATELY NOT IMPORTED (5 October 2026). "Press a price to type your
 * own." was removed from the grid; it survives on the dashboard sheet, which still imports it. */
import {
  PriceAmountInput, PriceCell, PriceModeSelect, PriceRoundingSelect,
  ROW_H, GRID_CONTROL_H, GRID_TYPED_H,
} from '@/components/shared/PriceControls'
/* Settings' section-heading token — SERVICE and USED BY use it, like every Settings group. */
import { SUBCARD_HEADING } from '@/lib/ui-tokens'
/* ⚠️ THE TYPES AND NOTHING ELSE. Every price this screen SHOWS is computed inside `<PriceCell>`,
 * which calls `priceForItem` — so this file never calls the arithmetic directly and cannot drift
 * from it by calling it slightly differently. */
import type { PriceMode, PriceRounding, PriceSetup } from '@/lib/event-pricing/price'
import {
  SERVICE_ROWS, TYPE_NAME_CHIPS, MAX_TYPE_NAME,
  /* ⚠️ `blankTypeValues` IS NO LONGER IMPORTED HERE. It was what "Match Standard" sent — every column
   * NULL, i.e. "follow Standard" — and that mechanism is gone: a type holds its own values, so
   * matching Standard COPIES Van 1's current ones (server-side, `match_standard`). The function
   * itself survives in lib/event-types/types.ts as the schema's own notion of "nothing set", which is
   * what the route still validates against. */
  colourFor, STANDARD_COLOUR, TYPE_INTERVAL_CHOICES,
  type EventType, type ServiceRow,
} from '@/lib/event-types/types'
import { summariseType, changedCount, SERVICE_ROW_COUNT, type TypeFor } from '@/lib/event-types/resolve'
import { OFFLINE_PROTECTION_MODES } from '@/lib/copy/offlineProtection'
/* 🔴 EVERY WORD ON THIS SCREEN THAT ALSO APPEARS ON ANOTHER ONE COMES FROM HERE. */
import {
  SAME_SETTINGS_ALL_VANS_LABEL, SAME_SETTINGS_ALL_VANS_HEADER, SAME_SETTINGS_CONFIRM,
  EVENT_TYPES_FOOTER_STANDARD, EVENT_TYPES_FOOTER_ONE_EVENT, EVENT_TYPES_SUBTITLE,
  MATCH_STANDARD_LABEL, MATCH_STANDARD_CONFIRM,
  PRICE_SETTING_LABELS, PRICES_STANDARD_CELL, PRICES_TRUCK_WIDE_TITLE,
  PRICES_MENU_CELL, ITEM_PRICES_SHOW, ITEM_PRICES_HIDE,
  OFFLINE_WHEN_OFFLINE_LABEL, 
  PRICE_MODES_WITH_AMOUNT,
} from '@/lib/copy/serviceSettings'
/* The rack size Settings' own buzzer toggle writes when it is switched ON. Standard's buzzer switch
 * makes the same call, so it must use the same default rather than pick a number. */
import { BUZZER_DEFAULT_COUNT } from '@/lib/buzzer'
/* ⚠️ THE SAME `normaliseInterval` SETTINGS USES, so Standard's dropdown cannot send a value its own
 * save path would 400 on. */
import { normaliseInterval } from '@/lib/slot-interval'
/* ── 🔴 PRIVATE EVENTS (20261014). Every word from the one copy module. ─────────────────────────── */
/* ⚠️ `PRIVATE_LINK_STANDARD_CELL` IS DELIBERATELY NOT IMPORTED (5 October 2026). "Open to everyone"
 * was removed from the screen; the constant survives in the copy module as the record of why, and
 * `scripts/event-types.cjs` asserts the string reaches no screen — an import here would fail it. */
import {
  ORDERING_SECTION, PRIVATE_LINK_ROW_LABEL, PRIVATE_COLUMN_TITLE, MAX_ONLY_TITLE,
  /* 🔴 THE PURPLE PANEL'S WORDS — the same constants the old separate tick used, so replacing the
   * control did not reword the explanation. */
  PRIVATE_TICK_HELP, PRIVATE_LINK_PROMISE, PRIVATE_NAME_LABEL, PRIVATE_NAME_HELP,
  PRIVATE_NAME_PLACEHOLDER,
} from '@/lib/private-events/copy'

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
  /** This van's RESOLVED cash setting — `truck_vans.takes_cash ?? trucks.takes_cash` (5 Oct 2026). */
  takes_cash: boolean
  /** The RAW column: null ⇒ this van has no opinion and follows the truck. */
  takes_cash_own: boolean | null
}

/** Van 1's resolved service values — what a new type and "Match Standard" copy. */
export type VanOneValues = Partial<Record<string, boolean | number | string | null>>

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

/* ── ⛔ `rowIsOwn` IS DELETED (5 October 2026) ────────────────────────────────────────────────────
 * It answered "does this type say anything of its own for this row?", and its ONLY consumer was the
 * FADED look that meant "this cell is showing Standard's value, not mine". A type holds its own
 * values now, so every cell is its own and the question has one answer. Leaving the function would
 * leave the faded design in the file for someone to reach for — which is how the defect Dominic met
 * on localhost would come back. See `TypeControl`'s header for the whole argument. */

/**
 * ── 🔴 OFFLINE PROTECTION IS A **SWITCH** NOW, AND THE MODE IS A SUB-ROW ──────────────────────────
 * Dominic, 5 October 2026: "Offline order protection becomes a SWITCH (Standard per van and per
 * type), and when on, an indented sub-row 'When offline' shows the mode select in that column."
 *
 * ⛔ WHAT THIS REPLACES, AND WHY IT WAS WRONG. The row was ONE three-choice dropdown —
 * `Off / Pause ordering / Keep taking orders, confirm them yourself` — which made it the only row in
 * the grid that was not a switch, and put a SAFETY-CRITICAL mode at the same level as an on/off. An
 * operator scanning the column for "is protection on here?" had to read and interpret a sentence.
 * Now the switch is the question and the mode is a detail of the answer, which is also the shape
 * Settings › Kitchen has always had (a switch, then a mode when it is on).
 *
 * 🔴 `OFFLINE_CHOICES`, `standardOfflineValue`, `offlineValue` AND `offlinePatch` ARE DELETED. All
 * four existed to fold the switch and the mode into one value; with two controls there is nothing to
 * fold, and a dead `'off'`-bearing choice list is the thing a later reader would reach for to put the
 * dropdown back. The MODE's two labels still come from `OFFLINE_PROTECTION_MODES` — this is a change
 * of SHAPE, not of vocabulary, so this screen, Settings › Kitchen and the dashboard still word them
 * identically.
 *
 * ⛔ THE AUTO-REJECT DELAY IS STILL NOT OFFERED ON A TYPE, and that stays Dominic's 4 October
 * decision — it is per-event, on the dashboard, and the only thing that acts on it is a plpgsql
 * function (`claim_order_for_auto_reject`) that resolves `coalesce(event_override, van)` and cannot
 * read this resolver.
 */
const OFFLINE_MODE_CHOICES = OFFLINE_PROTECTION_MODES.map(m => ({ value: m.value as string, label: m.label }))

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
      /* ══ 🔴 PER VAN NOW (5 October 2026), AND THIS IS THE DEFECT'S ACTUAL FIX ═══════════════════
       * Dominic, on localhost: "Turning on 'Do you take cash?' for Van 1 also turned it on for Van 2."
       * It did, and this line is why: it returned `scope: 'truck'`, so every van column's switch wrote
       * the SAME `trucks.takes_cash` through `update_truck`. There was no per-van column to write.
       *
       * 🔴 `truck_vans.takes_cash` (20261012) IS THAT COLUMN, so this row is `scope: 'van'` like the
       * other four and each column writes its own van. Nullable, so NULL still means "follow
       * `trucks.takes_cash`" — but a SWITCH always writes an explicit true or false, which is what a
       * switch means.
       * ⚠️ `trucks.takes_cash` IS NOT WRITTEN FROM HERE ANY MORE and is not dead: it is the last link
       * of the resolver chain for a van that has never been touched. Settings owns it, and after
       * 20261012 its control there is only drawn when the van column is absent.
       * ⚠️ THE KEY IS THE COLUMN NAME, not a camel one. `update_van_settings` destructures
       * `takes_cash` (added 5 October) — and that handler's own warning is that a key it does not
       * name is dropped SILENTLY, i.e. a green save that wrote nothing. */
      return { scope: 'van', action: 'update_van_settings', payload: { takes_cash: value === true } }
    case 'offline_protection':
      /* ── 🔴 THREE SHAPES NOW, BECAUSE THE ROW IS A SWITCH PLUS A SUB-ROW ──────────────────────
       *   false        — the SWITCH off. Writes the switch and NOTHING ELSE.
       *   true         — the SWITCH on.  Writes the switch and NOTHING ELSE.
       *   a mode string — the "When offline" sub-row. Writes both, because a mode with the switch off
       *                   would display and do nothing.
       * ⚠️ TURNING THE SWITCH ON OR OFF MUST NOT TOUCH THE MODE, which is what Settings does and the
       * reason it matters: turning protection back on should not silently change what it will then
       * DO. That is a safety-critical setting changing itself behind an unrelated tap. */
      if (value === false) return { scope: 'van', action: 'update_van_settings', payload: { autoPauseOnOffline: false } }
      if (value === true) return { scope: 'van', action: 'update_van_settings', payload: { autoPauseOnOffline: true } }
      return { scope: 'van', action: 'update_van_settings', payload: { autoPauseOnOffline: true, offlineProtectionMode: String(value) } }
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
/* 🔴 WIDENED FROM 212 TO 260 (5 October 2026), BECAUSE LABELS WRAP NOW INSTEAD OF TRUNCATING.
 * Dominic: no ellipsis anywhere; "Take orders by private link and QR code" must be fully readable.
 * Truncation was the old answer to a narrow column — it hid the end of the longest label behind a
 * hover title, which is a tooltip nobody on a tablet can reach. Wrapping needs room, so the column
 * got it; `scripts/event-types-render.cjs` measures that no label is clipped at 1440/820/390 in both
 * engines, which is the check that would have caught the old width. */
const GRID_LABEL_W = 260
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
/**
 * ── 🔴 THE MAX BADGE (20261014) ───────────────────────────────────────────────────────────────────
 * Shown to a truck that has `private_events` (Pro) but not `event_types` (Max), beside the two things
 * that key buys: "+ New event type" and the PRICES section.
 * ⛔ A LOCK **PLUS THE WORD**, not a lock alone. A bare padlock beside a heading is ambiguous — the
 * Private column already carries one, meaning "built in, cannot be renamed" — so this one names the
 * plan, which is the only thing an operator can act on.
 * ⚠️ MODULE SCOPE, NOT A NESTED COMPONENT. Declared inside the panel it would be a new component type
 * on every render, which remounts its subtree and which `react-hooks/static-components` refuses. It
 * closes over nothing, so there is no reason for it to live inside.
 */
function MaxBadge() {
  return (
    <span
      title={MAX_ONLY_TITLE}
      className="ml-1.5 inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-px text-[9px] font-bold normal-case tracking-wide text-amber-700"
    >
      <span aria-hidden="true">🔒</span>{MAX_ONLY_TITLE}
    </span>
  )
}

const CELL_DIVIDER = 'border-l border-slate-100'

/* ── 🔴 THE ZEBRA STRIPES AND THE SECTION BAND, AS TOKENS ─────────────────────────────────────────
 * Dominic, 5 October 2026: "rows alternate white / a very light grey (about #F6F8FA), restarting
 * after each section or category heading. Section rows a slightly darker band (about #E9EEF4)."
 *
 * 🔴 THEY ARE HEX, IN ONE PLACE, BECAUSE THE RENDER HARNESS MEASURES THEM. Tailwind's slate-50 is
 * #F8FAFC and slate-100 is #F1F5F9 — neither is either of the two figures asked for, and inventing a
 * class for "about #F6F8FA" would be a value nobody could check. `scripts/event-types-render.cjs`
 * reads the computed `background-color` of each row and asserts it alternates and restarts, so these
 * two strings are the contract.
 * ⚠️ A SPANNING CELL STAYS WHITE, which is the instruction and also the only thing that works: a cell
 * covering four striped rows cannot be two colours, and painting it one of them would make the stripe
 * read as a row boundary in the wrong place. */
const STRIPE_BG = '#F6F8FA'
const SECTION_BG = '#E9EEF4'
const WHITE_BG = '#FFFFFF'

/** A type's pricing as /api/event-types `load` (with `withPrices`) sends it. */
export interface TypePricingRow {
  price_change_on: boolean
  price_mode: PriceMode
  price_amount: number | null
  price_rounding: PriceRounding
  /** POUNDS by `menu_items_db.id`. */
  typed: Record<string, number>
}

/** The menu, by category, in menu order — the Item prices rows. */
export interface PricingMenu {
  categories: { id: string; name: string; items: { id: string; name: string; price: number }[] }[]
}

/** A type's pricing as a `PriceSetup`, for the shared arithmetic. */
const setupOf = (p: TypePricingRow | undefined): PriceSetup | null =>
  p && p.price_change_on
    ? { mode: p.price_mode, amount: p.price_amount, rounding: p.price_rounding, typed: p.typed }
    : null

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

export function EventTypesPanel({ token, onClose, manageApi, inline = false }: {
  token: string
  /** Required for the overlay; ignored when `inline`, which has nothing to close. */
  onClose?: () => void
  /**
   * ══ 🔴 INLINE: THE SAME GRID, ON THE PAGE, INSTEAD OF OVER IT ════════════════════════════
   * Event types is the third Schedule pill now, not a button opening an overlay. What changes is the
   * SHELL and nothing else: the fixed backdrop, the dialog role, the ✕ and the 92vh body scroller
   * drop away, and the box becomes a card in the page's own flow.
   * 🔴 THE GRID, THE COLUMN WIDTHS, THE HEADER'S "+ New event type" AND THE FOOTER ARE THE SAME CODE.
   * They are not re-laid-out for the page — a second copy of a six-column grid is how two screens come
   * to disagree about what a column is worth. The width expression is the same one, cap included.
   * ⚠️ LEFT-ALIGNED, NOT CENTRED. In the overlay the dialog is centred in the viewport; on the page it
   * starts at the content's left edge like every other card, so a truck with one type does not get a
   * box floating in the middle of the column.
   */
  inline?: boolean
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
  /** 🔴 Pro — the Private column and its link/QR row. */
  const [canPrivate, setCanPrivate] = useState(false)
  /** 🔴 Max — "+ New event type", rename/move/delete, and the PRICES rows. */
  const [canTypes, setCanTypes] = useState(false)
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
  /* ── PRICING (§70) ───────────────────────────────────────────────────────────────────────────────
   * 🔴 `pricingReady` false MEANS 20261011 IS NOT APPLIED, and the whole PRICES section is absent —
   * not disabled, absent. Controls that cannot store anything are worse than no controls: the
   * operator would set a price, see it save, and the next order would charge the menu. It is the same
   * honesty `missingTable` already gives the types themselves. */
  const [pricingReady, setPricingReady] = useState(false)
  const [pricing, setPricing] = useState<Record<string, TypePricingRow>>({})
  const [menu, setMenu] = useState<PricingMenu>({ categories: [] })
  /* ⚠️ PER BROWSER SESSION ONLY, AS INSTRUCTED — plain state, no localStorage and no column. The item
   * rows are forty rows of controls; an operator who collapsed them does not want them back on the
   * next render, and does not want that remembered for ever either. */
  const [showItems, setShowItems] = useState(false)
  /* ── 🔴 "SAME SETTINGS FOR ALL VANS" (5 October 2026) ───────────────────────────────────────────
   * `sameSettings` is READ from the route, which computes it from `truck_vans.same_as_first_van`:
   * ON when every non-first active van has it on, any mix OFF. Nothing is written on load.
   * ⚠️ `sameSettingsAvailable` false ⇒ the "Same as Van 1" migration is not applied and the VANS row
   * is not drawn at all — a switch that cannot store anything is worse than no switch. */
  const [sameSettings, setSameSettings] = useState(false)
  const [sameSettingsAvailable, setSameSettingsAvailable] = useState(false)
  const [vanOneValues, setVanOneValues] = useState<VanOneValues>({})
  /** The OFF → ON confirm. Null = not asking. */
  const [confirmSameSettings, setConfirmSameSettings] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api(token, { action: 'load', withPrices: true })
      setTypes((r.types ?? []) as TypeRow[])
      setStandard(r.standard ?? null)
      setVans(Array.isArray(r.vans) ? (r.vans as VanRow[]) : [])
      setReadOnly(r.readOnly === true)
      setUpgradeMessage(r.upgradeMessage ?? null)
      setMissingTable(r.missingTable === true)
      setSameSettings(r.sameSettingsAllVans === true)
      setSameSettingsAvailable(r.sameSettingsAvailable === true)
      /* 🔴 THE TWO GATES, SEPARATELY (20261014). `canPrivate` is Pro; `canTypes` is Max. A Pro truck
       * gets the Private column and the ORDERING row, and a Max badge on everything else. */
      setCanPrivate(r.canPrivate === true)
      setCanTypes(r.canTypes === true)
      setVanOneValues((r.vanOneValues ?? {}) as VanOneValues)
      setPricingReady(r.pricingReady === true)
      setPricing((r.pricing ?? {}) as Record<string, TypePricingRow>)
      setMenu((r.menu ?? { categories: [] }) as PricingMenu)
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

  /* ── 🔴 PRICING WRITES. SEPARATE ACTIONS, NOT `update`, BECAUSE THEY ARE A SEPARATE ALLOWLIST ────
   * `update`'s loop writes `SERVICE_KEYS` and nothing else, by design — a client PATCHing a column
   * outside that list is dropped. Routing prices through it would mean widening that allowlist to
   * cover money, on the one action the service settings save through. `set_type_pricing` is its own
   * handler with its own validation (`cleanPricingPatch`), and the plan gate covers both because the
   * route refuses any non-`load` action by default. */
  const patchPricing = (id: string, values: Record<string, unknown>) => {
    /* ══ 🔴 "Set each price myself" OPENS THE ITEM PRICES (5 October 2026) ═══════════════════════
     * Choosing `'none'` means "there is no across-the-board rule; I will set each price" — and the
     * Amount and Rounding cells go blank at the same moment. Leaving the item rows folded away would
     * answer that choice with an emptier screen than before it: the operator has just said where the
     * prices come from, and the prices are not on screen.
     * ⚠️ IT ONLY EVER OPENS, NEVER CLOSES. Switching back to "+ %" leaves them open — the operator
     * may well want to see what their typed prices do to the new rule, and a screen that folded
     * itself up under them would be taking a decision they did not ask for.
     * ⚠️ AND IT IS KEYED ON THE **MODE BEING SENT**, not on the type's current state, because this
     * runs before the save returns. */
    if (values.price_mode === 'none') setShowItems(true)
    return act({ action: 'set_type_pricing', id, ...values })
  }

  const setTypeItemPrice = (id: string, itemId: string, price: number | null) =>
    act({ action: 'set_type_item_price', id, itemId, price })

  /**
   * ── 🔴 MATCH STANDARD — EVERY SETTING ON THIS TYPE BACK TO NULL ────────────────────────────────
   * The way back to inheriting, now that no control carries its own "Same as Standard" affordance.
   * It is in the ⋯ menu beside Rename/Move/Delete because it is a whole-type action, and it asks
   * first because it is the only item in that menu that throws work away.
   * ⚠️ IT SENDS `blankTypeValues()`, the SAME starting state `create` uses, rather than listing the
   * columns here — so a setting added in a later stage is reset by this without touching this line.
   */
  /* ══ 🔴 MATCH STANDARD **COPIES** NOW; IT USED TO CLEAR (5 October 2026) ═══════════════════════
   * It sent `blankTypeValues()` — every column NULL — which under the old design meant "follow
   * Standard from now on". A type holds its own values, so there is no "follow": the same words now
   * COPY what Standard is right now. The operator's intent is identical; the copy is a snapshot
   * rather than a subscription, which is exactly the change — a subscription is what made Market move
   * when Van 1 moved.
   * 🔴 THE SERVER COMPUTES THE COPY (`match_standard` → `vanOneServiceValues`), so the values the ⋯
   * menu promises are the values that land. Sending them from here would be a second definition of
   * "Standard" that could disagree with the one `+ New event type` uses. */
  const matchStandard = (id: string) =>
    act({ action: 'match_standard', id }, () => setConfirmMatch(null))

  /**
   * ── 🔴 "SAME SETTINGS FOR ALL VANS" — THROUGH SETTINGS' OWN ACTION, ONCE PER VAN ────────────────
   * `set_van_same_as_first` is the action the Settings switch calls, and this calls exactly it —
   * which is what makes the two switches one switch rather than two that could disagree. The grid
   * sends it for every van EXCEPT the first (a van cannot follow itself; the handler refuses it too).
   *
   * ⚠️ SEQUENTIAL, NOT `Promise.all`, for the reason `saveStandard` gives: turning it ON makes each
   * call COPY the first van's whole settings, and firing N of those in parallel would have them
   * racing each other for no gain on a truck with two vans.
   * 🔴 AND IT RELOADS AFTERWARDS rather than guessing. The route recomputes "are they all the same?"
   * from the vans it reads, and that answer is the whole behaviour of this row.
   */
  const saveSameSettings = async (on: boolean) => {
    if (!manageApi || vans.length < 2) return
    setStandardBusy(true); setMsg(null)
    try {
      const firstId = vans[0]?.id
      for (const v of vans) {
        if (v.id === firstId) continue
        await manageApi('set_van_same_as_first', { vanId: v.id, on })
      }
      await load()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not save', bad: true })
      await load()
    } finally { setStandardBusy(false); setConfirmSameSettings(false) }
  }

  /**
   * ── 🔴 "Take orders by private link and QR code", SAVED (20261014) ─────────────────────────────
   * One action, writing `event_types.private_link_ordering` on the kind='private' row. The route
   * creates the Private type if it is somehow not there yet, so this switch can never be a control
   * with nothing behind it.
   * ⚠️ IT RELOADS rather than patching local state, for the reason every other save here does: the
   * route decides what the row holds, and guessing it locally is how a screen comes to disagree with
   * the database it is showing.
   */
  const saveLinkOrdering = async (on: boolean) => {
    setStandardBusy(true); setMsg(null)
    try {
      await api(token, { action: 'set_private_link_ordering', on })
      await load()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not save', bad: true })
      await load()
    } finally { setStandardBusy(false) }
  }

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

  /**
   * ── 🔴 MOVE LEFT/RIGHT REORDERS **CUSTOM TYPES AMONG THEMSELVES** (5 October 2026) ───────────────
   * Private is pinned straight after Standard and is not in the running. The swap therefore happens
   * inside the list of CUSTOM types, and the reorder is sent as the custom ids in their new order.
   *
   * ⛔ THE INDICES CANNOT BE THE GRID'S. `types` has Private at index 0, so `i + by` on the grid's
   * indices would let the first custom type swap WITH Private — moving the built-in, which the server
   * would then renumber, and the column would drift away from Standard. Working in the custom list is
   * what makes "only reorders custom types among themselves" true rather than merely intended.
   * ⚠️ AND PRIVATE'S ID IS NOT SENT AT ALL, so `reorder` cannot renumber it even if asked to.
   */
  const move = (id: string, by: -1 | 1) => {
    const customs = types.filter(t => t.kind !== 'private')
    const i = customs.findIndex(t => t.id === id)
    const j = i + by
    if (i < 0 || j < 0 || j >= customs.length) return
    const ids = customs.map(t => t.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setMenuFor(null)
    return act({ action: 'reorder', ids })
  }
  /** The index of a type within the CUSTOM list, for disabling Move left/right at the ends. */
  const customIndexOf = (id: string) => types.filter(t => t.kind !== 'private').findIndex(t => t.id === id)
  const customCount = types.filter(t => t.kind !== 'private').length

  const editable = !readOnly && !busy
  /**
   * ── 🔴 THE **PRO** EDITABILITY, SEPARATE FROM `editable` (20261014) ─────────────────────────────
   * `readOnly` is `!canWrite` — the MAX gate — so a Pro truck reaches this screen with `editable`
   * false, which is right for every control except the one it is entitled to. Without this, a Pro
   * truck would see its own Private column drawn read-only and have no way to use the feature it
   * pays for.
   * ⚠️ IT STILL RESPECTS `busy`, so a save in flight disables it like everything else.
   */
  const privateEditable = canPrivate && !busy
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
  /* ══ 🔴 THE COLUMN SHAPE IS THE SWITCH'S, NOT ONLY THE VAN COUNT'S (5 October 2026) ════════════
   * Dominic: "ON: one Standard column, header STANDARD over 'All vans'. OFF: one column per active
   * van, oldest first, each saving to that van only."
   *
   * ⚠️ THIS SUPERSEDES A RULE THIS FILE ARGUED FOR ON 4 OCTOBER — "the shape of the screen is a fact
   * about the truck (how many vans it has), never about the values in it" — and the supersession is
   * deliberate rather than an oversight. That rule existed because the columns used to appear and
   * disappear as VALUES changed (`perVan`), so equalising two vans made every row jump. The shape now
   * follows an explicit SWITCH the operator pressed, which is the opposite case: they asked for it,
   * and the row that changes it is the first row on the screen.
   * ⛔ IT STILL DOES NOT CONSULT `standardIsPerVan`. Nothing keys the layout off whether the values
   * happen to agree — that is the part of the 4 October rule that stands. */
  const vanColumns = useMemo(
    () => (vans.length > 1 && !sameSettings ? vans : []),
    [vans, sameSettings],
  )
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

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // THE GRID'S SHAPE — PLANNED, THEN DRAWN
  // ════════════════════════════════════════════════════════════════════════════════════════════

  /** How many columns the Standard side occupies. One van (or none) ⇒ one combined column. */
  const vanCount = vanColumns.length > 1 ? vanColumns.length : 1

  /**
   * The Standard column headers, and which van (if any) each one writes to.
   *
   * ⚠️ `van: null` IS THE COMBINED "Standard" COLUMN, and it writes EVERY active van — the behaviour
   * a one-van truck has always had, and the reason a single-van grid has no van name in it. A named
   * van column writes that van alone.
   */
  const vanHeaders = useMemo(() => (
    vanColumns.length > 1
      ? vanColumns.map(v => ({ key: v.id, name: v.name, van: v as VanRow | null }))
      /* 🔴 THE COMBINED COLUMN'S NAME SAYS WHICH CASE IT IS. With several vans following each other it
       * is "All vans" (the switch is on, and edits go to Van 1 which fans out); with one van it is
       * "Standard", unchanged. A truck with two vans and the switch on must not read "Standard" over
       * a column that is really Van 1 — the header is the only thing that says so. */
      : [{
          key: 'standard',
          name: vans.length > 1 ? SAME_SETTINGS_ALL_VANS_HEADER : 'Standard',
          van: null as VanRow | null,
        }]
  ), [vanColumns, vans.length])

  const canEditStandard = editable && !standardBusy && !!manageApi

  /* ── OFFLINE PROTECTION, PER COLUMN — the switch's state and the mode under it ─────────────────── */
  type VanHeader = (typeof vanHeaders)[number]
  const standardOfflineOn = (v: VanHeader): boolean =>
    v.van ? v.van.offline_enabled : (standard?.offline_protection.enabled === true)
  const standardOfflineMode = (v: VanHeader): string =>
    v.van ? v.van.offline_mode : (standard?.offline_protection.mode ?? 'pause')
  const onStandardOfflineMode = (v: VanHeader, mode: string) => {
    const row = SERVICE_ROWS.find(r => r.id === 'offline_protection')
    if (!row) return
    /* ⚠️ THROUGH THE SAME `saveStandard*` PAIR, SO THE SUB-ROW IS NOT A SECOND SAVE PATH. A mode
     * string reaches `standardWriteFor`'s third shape, which writes the switch AND the mode. */
    if (v.van) void saveStandardForVan(row, v.van.id, mode)
    else void saveStandard(row, mode)
  }
  /** A type's resolved offline switch — its own value, or Standard's. */
  const typeOfflineOn = (t: TypeRow): boolean =>
    t.offline_protection === true || t.offline_protection === false
      ? t.offline_protection === true
      : (standard?.offline_protection.enabled === true)
  /** A type's resolved offline mode — its own, or Standard's. */
  const typeOfflineMode = (t: TypeRow, std: StandardValues): string =>
    t.offline_protection_mode ?? std.offline_protection.mode ?? 'pause'

  /* ── 🔴 THE "When offline" ROW DISAPPEARS WHEN PROTECTION IS OFF IN **EVERY** COLUMN ────────────
   * Not "when Standard is off" and not "when the first van is off": the row exists to hold the mode
   * for the columns that have one, so one column with protection on is enough to need it, and none
   * means the row would be a label with nothing under it. Same rule as the price rule rows. */
  const anyOfflineOn = useMemo(
    () => vanHeaders.some(standardOfflineOn) || types.some(typeOfflineOn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vanHeaders, types, standard],
  )

  /* ── 🔴 THE PRICE RULE ROWS AND THE ITEM ROWS FOLD AWAY WHEN NO TYPE'S SWITCH IS ON ────────────
   * Dominic: "the three rows disappear entirely when no type's switch is on". Three dropdowns with
   * every cell blank is three rows of furniture — and it reads as "nothing is set yet" rather than
   * "no type changes prices", which is a different and already-answered question (the switch row
   * above is all off). */
  const anyPriceOn = useMemo(
    () => types.some(t => pricing[t.id]?.price_change_on === true),
    [types, pricing],
  )
  /** How many rows the "Your menu prices" cell spans DOWN through, beyond its own. */
  const ruleRowCount = anyPriceOn ? 3 : 0
  /**
   * ── 🔴 THE BUILT-IN PRIVATE TYPE, IF THIS TRUCK HAS ONE (20261014) ───────────────────────────────
   * The grid draws the ORDERING section only when it exists, which is "20261014 applied AND the truck
   * is entitled to the feature" — the route creates it on load for exactly those trucks.
   * ⚠️ `kind` DEFAULTS TO 'custom' WHEN THE PROBE COULD NOT READ IT (see `readTypeKinds`), so a
   * pre-migration load finds nothing here and the section is absent rather than broken.
   */
  const privateType = useMemo(
    () => types.find(t => t.kind === 'private') ?? null,
    [types],
  )
  /* ⛔ `itemCount` IS GONE (5 October 2026). The pill said "Show 23 items"; it now says
   * "Show prices" — a count nobody acts on, and "items" in a PRICES band read as availability. */

  /**
   * ── 🔴 EVERY BODY ROW, IN ORDER, AS DATA ──────────────────────────────────────────────────────
   * PRICES above SERVICE, as instructed — a truck looks at prices far more often than at the buzzer
   * prompt, and the section that matters most should not be below the one that matters least.
   */
  type PlanRow =
    | { k: 'section'; id: string; label: string; indent?: boolean }
    | { k: 'category'; id: string; label: string; indent?: boolean }
    | { k: 'price-switch'; id: string; label: string; indent?: boolean }
    | { k: 'price-rule'; id: string; label: string; which: 'mode' | 'amount' | 'rounding'; indent?: boolean }
    | { k: 'items-band'; id: string; label: string; indent?: boolean }
    | { k: 'price-item'; id: string; label: string; item: { id: string; name: string; price: number }; indent?: boolean }
    | { k: 'service'; id: string; label: string; row: ServiceRow; indent?: boolean }
    | { k: 'offline-mode'; id: string; label: string; indent?: boolean }
    | { k: 'same-settings'; id: string; label: string; indent?: boolean }
    /* ⛔ `used-by` IS GONE (5 October 2026) — see the note where the section used to be pushed. */
    /** 🔴 The one row only the Private type has: "Take orders by private link and QR code". */
    | { k: 'private-link'; id: string; label: string; indent?: boolean }

  const plan = useMemo<PlanRow[]>(() => {
    const out: PlanRow[] = []
    /* ⚠️ THE WHOLE SECTION IS ABSENT BEFORE 20261011 IS APPLIED. Not disabled — absent. See
     * `pricingReady`'s own note: a control that cannot store anything is worse than no control. */
    /* ══ 🔴 THE VANS SECTION, FIRST, AND ONLY FOR A TRUCK WITH 2+ ACTIVE VANS ═════════════════════
     * A one-van truck has nothing to make the same as anything, so the row would be a switch with no
     * meaning — and the instruction says so explicitly ("2+ active vans only"). The render harness
     * asserts a one-van truck shows no VANS row.
     * ⚠️ ALSO ABSENT BEFORE THE "Same as Van 1" MIGRATION (`sameSettingsAvailable`). */
    if (vans.length > 1 && sameSettingsAvailable) {
      out.push({ k: 'section', id: 'sec-vans', label: 'VANS' })
      out.push({ k: 'same-settings', id: 'same-settings', label: SAME_SETTINGS_ALL_VANS_LABEL })
    }
    /* ══ 🔴 ORDERING, ABOVE PRICES AND BELOW VANS (20261014) ══════════════════════════════════════
     * One row, and it belongs to the Private column: Standard's cell is a STATEMENT ("Open to
     * everyone") and every custom type's cell is blank, because no other type offers link ordering at
     * all — there is nothing for them to switch.
     * ⛔ ABSENT, NOT DISABLED, WHEN THERE IS NO PRIVATE TYPE. A truck whose 20261014 has not been
     * applied, or which is not entitled to the feature, sees no section — the same posture PRICES
     * takes before 20261011 ("a control that cannot store anything is worse than no control").
     * ⚠️ IT SITS ABOVE PRICES BECAUSE IT DECIDES WHETHER THERE IS ANYTHING TO PRICE. If a private
     * event takes no orders online, its prices never reach a customer. */
    if (privateType) {
      out.push({ k: 'section', id: 'sec-ordering', label: ORDERING_SECTION })
      out.push({ k: 'private-link', id: 'private-link', label: PRIVATE_LINK_ROW_LABEL })
    }
    if (pricingReady) {
      out.push({ k: 'section', id: 'sec-prices', label: 'PRICES' })
      out.push({ k: 'price-switch', id: 'price-on', label: PRICE_SETTING_LABELS.price_change_on })
      if (anyPriceOn) {
        out.push({ k: 'price-rule', id: 'price-mode', label: PRICE_SETTING_LABELS.price_mode, which: 'mode', indent: true })
        out.push({ k: 'price-rule', id: 'price-amount', label: PRICE_SETTING_LABELS.price_amount, which: 'amount', indent: true })
        out.push({ k: 'price-rule', id: 'price-rounding', label: PRICE_SETTING_LABELS.price_rounding, which: 'rounding', indent: true })
        /* ITEM PRICES IS A SECTION BAND NOW, NOT A ROW (5 October 2026). The pill sits right after
         * the heading text, inside the band: the grid scrolls SIDEWAYS, so anything further right is
         * off-screen on exactly the truck with enough types to need it. It counts the items, so
         * "Show 23 items" says what is about to unfold. */
        out.push({ k: 'items-band', id: 'sec-items', label: 'ITEM PRICES' })
        if (showItems) {
          for (const c of menu.categories) {
            out.push({ k: 'category', id: `cat-${c.id}`, label: c.name })
            for (const it of c.items) {
              out.push({ k: 'price-item', id: `pi-${c.id}-${it.id}`, label: it.name, item: it })
            }
          }
        }
      }
    }
    out.push({ k: 'section', id: 'sec-service', label: 'SERVICE' })
    for (const row of SERVICE_ROWS) {
      out.push({ k: 'service', id: `svc-${row.id}`, label: row.label, row })
      if (row.id === 'offline_protection' && anyOfflineOn) {
        out.push({ k: 'offline-mode', id: 'offline-mode', label: OFFLINE_WHEN_OFFLINE_LABEL, indent: true })
      }
    }
    /* ══ ⛔ THE "USED BY / Upcoming events" SECTION IS REMOVED (5 October 2026) ══════════════════
     * It was a band and a row at the bottom of every grid showing each type's upcoming-event count,
     * with "Everything else" under Standard. Two rows of screen on a dense grid, carrying a number
     * that matters at exactly ONE moment: when you are about to delete a type and need to know how
     * many events it would drop back to Standard.
     * 🔴 SO THE COUNT MOVED TO WHERE IT IS ACTED ON — the delete confirm, which now reads
     * "N upcoming events use <Type>. They'll go back to Standard." The count is still loaded
     * (`countUpcomingByType` in the route, unchanged), so nothing was lost but the two rows.
     * ⚠️ AND PRIVATE CANNOT BE DELETED, so that confirm is never reached for it. */
    return out
  }, [pricingReady, anyPriceOn, showItems, menu, anyOfflineOn, vans.length, sameSettingsAvailable, privateType])

  /**
   * ── 🔴 THE ZEBRA STRIPE, RESTARTING AFTER EVERY HEADING ───────────────────────────────────────
   * The counter resets at each section AND each category heading, so the first row under "Margheritas"
   * is white exactly as the first row under "SERVICE" is. Striping continuously instead would make the
   * parity depend on how many items the previous category happened to have — the stripe would read as
   * meaning something, and it would mean nothing.
   * ⚠️ A HEADING ROW ITSELF IS NEVER STRIPED: a section row has its own darker band, and a category
   * row is white so it reads as a break rather than as another data row.
   */
  const stripeIndex = useMemo(() => {
    const out: boolean[] = []
    let n = 0
    for (const r of plan) {
      /* 🔴 `items-band` RESTARTS THE COUNTER TOO. It draws as a section — darker band, heading type,
       * never striped — so a counter that ran straight through it would hand the parity of every item
       * row below to however many setting rows happened to sit above. Today a category always follows
       * the band and resets it anyway, which is exactly why this was worth writing down rather than
       * leaving to luck: it is right by accident until the day the band has items directly under it. */
      if (r.k === 'section' || r.k === 'items-band' || r.k === 'category') { n = 0; out.push(false); continue }
      out.push(n % 2 === 1)
      n++
    }
    return out
  }, [plan])
  const stripeFor = (idx: number): boolean => stripeIndex[idx] === true

  /** The header occupies grid rows 1 and 2, so the body starts at 3. */
  const BODY_ROW_1 = 3

  /* ⚠️ CLOSING THE ⋯ MENU ON ANY OUTSIDE CLICK. A menu that stays open while the operator clicks a
   * control in the next column would sit over the thing they are trying to change. */
  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuFor])

  /* ⚠️ ONE BOX, TWO SHELLS. The ternaries below are the whole of the difference between the overlay
   * and the pill; everything between them is shared markup.
   * ⚠️ AND THE SHELL IS NOT A COMPONENT DEFINED HERE. It was, briefly, and the React Compiler lint
   * caught it: a component created during render is a NEW type on every render, so React unmounts and
   * remounts its whole subtree — which here is the grid, taking the sideways scroll position and any
   * focused control with it on every keystroke. The content is a VALUE; the wrapper is chosen after. */
  const content = (
    <>
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
      <div role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : true} aria-label="Event types"
        data-event-types-modal
        /* ⚠️ `valueColumnCount`, NOT `types.length + 1`. A two-van truck with two types now has FOUR
          * value columns, and the dialog has to be as wide as its content or the empty band this
          * expression exists to remove comes back on the other axis. */
        style={{ width: GRID_LABEL_W + GRID_COL_W * valueColumnCount + MODAL_SIDE_PADDING, maxWidth: 'min(1000px, 100%)' }}
        /* ⚠️ INLINE USES THE SHARED CARD'S OWN CLASSES (`shadow-sm border border-slate-200`), so it is
          * the same box as every other card on the page rather than a dialog dropped into it; and it
          * has NO height cap, because the page is the scroller there. */
        className={inline
          ? 'bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden'
          : 'bg-white max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden'}>

        {/* ── HEADER ───────────────────────────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-slate-200">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-slate-900 text-lg">Event types</h2>
            {/* 🔴 "Grey = same as Standard" IS GONE. Nothing on this screen is grey-as-a-legend any
              * more: a faded control shows the value it inherits, which needs no key. A legend for a
              * state that no longer exists is worse than no legend. */}
            <p className="text-xs sm:text-[13px] text-slate-500">{EVENT_TYPES_SUBTITLE}</p>
          </div>
          {/* ── 🔴 "+ New event type" IS A **MAX** ACTION (20261014) ─────────────────────────────
            * A Pro truck reaches this screen for its Private type and must not be able to make
            * custom ones. The badge says which plan; `disabled` stops the press; and
            * app/api/event-types/route.ts refuses `create` on the server, which is the rule — the
            * screen decides what is drawn, the route decides what is done. */}
          <div className="flex shrink-0 items-center">
            <Btn label="+ New event type" colour="ghost" disabled={!editable || !canTypes}
              onClick={() => setCreating(true)} />
            {!canTypes && canPrivate && <MaxBadge />}
          </div>
          {/* ⚠️ NO ✕ WHEN INLINE — there is nothing to close; the pill above is how you leave. */}
          {!inline && (
            <button type="button" onClick={() => onClose?.()} aria-label="Close"
              className="shrink-0 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-lg font-bold">✕</button>
          )}
        </div>

        {/* ⚠️ THE BODY SCROLLS ONLY IN THE OVERLAY. On the page the manage scroller already does it, and
          * a second vertical scroller inside a card is the "two scrollbars" shape this app avoids. The
          * grid's own SIDEWAYS scroller is inside and is unaffected by either. */}
        <div className={inline ? '' : 'flex-1 min-h-0 overflow-y-auto'}>
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
                      pricing={pricingReady ? pricing[t.id] : undefined}
                      onPatch={v => void patch(t.id, v)}
                      onPatchPricing={v => void patchPricing(t.id, v)}
                      onRename={() => { setRenaming(t.id); setRenameTo(t.name) }}
                      onDelete={() => setConfirmDelete(t.id)}
                    />
                  )
                })()}
              </div>

              {/* ══ TABLET AND UP: THE GRID ═══════════════════════════════════════════════════════
                * ── 🔴 EVERY CELL IS PLACED EXPLICITLY, AND THAT IS THE WHOLE REASON THIS READS AS A
                * TABLE. The first build let CSS grid auto-place, which works until something spans:
                * the "Your menu prices" cell spans the van columns AND four rows, the STANDARD
                * heading spans the van columns, and each type's header spans two rows. With
                * auto-placement, one of those spans pushes every later cell into the wrong column and
                * the whole grid shears — and it shears DIFFERENTLY for a one-van truck and a two-van
                * truck, which is the kind of fault that reaches an operator before it reaches a test.
                *
                * So the rows are PLANNED first (`plan`, below), each gets a row NUMBER, and every cell
                * carries `gridColumn` and `gridRow`. Spans are then arithmetic rather than hope.
                *
                * ── 🔴 THE COLUMN LINES RUN FROM THE HEADER TO THE BOTTOM, AND THAT IS WHY NO ROW IS A
                * `col-span-full` CELL ANY MORE. SERVICE and USED BY used to be one full-width div
                * each, so the vertical rules simply stopped at them and started again below — the
                * grid read as three stacked tables. Every row now emits a label cell plus ONE CELL PER
                * VALUE COLUMN, each carrying `border-l`, including the section and category headings
                * (whose value cells are empty but still draw their line).
                *
                * ⚠️ THE SCROLLER IS THE ROW AREA, so the card's own width never changes. */}
              <div className="hidden md:block overflow-x-auto px-2 pb-2" data-types-scroller>
                <div
                  className="min-w-max"
                  /* 🔴 VAN COLUMNS ARE THE SAME WIDTH AS TYPE COLUMNS — one `repeat` over every value
                   * column, so they cannot be given different widths by accident. */
                  style={{ display: 'grid', gridTemplateColumns: `${GRID_LABEL_W}px repeat(${valueColumnCount}, ${GRID_COL_W}px)` }}
                  data-types-grid
                >
                  {/* ── HEADER ROW 1: the shared STANDARD heading ──────────────────────────────────
                    * 🔴 ONE HEADING OVER THE VAN COLUMNS, NOT A "Standard" TAG IN EACH. Dominic,
                    * 5 October 2026. It was a per-column `Standard`/`default` tag beside each van
                    * name, which said the same word two or five times and left a type column and a van
                    * column looking like the same kind of thing. One spanning heading says it once and
                    * makes the two sides of the grid structurally different.
                    * ⚠️ WITH ONE VAN IT SPANS ONE COLUMN, which is the instruction and also just what
                    * the arithmetic does — no special case. */}
                  <div className="px-3 flex items-end" data-grid-corner
                    style={{ gridColumn: 1, gridRow: '1 / span 2', background: WHITE_BG }} />
                  <div data-grid-standard-heading
                    className={`${CELL_DIVIDER} px-2.5 flex items-center justify-center ${SUBCARD_HEADING}`}
                    style={{ gridColumn: `2 / span ${vanCount}`, gridRow: 1, height: ROW_H.category, background: WHITE_BG }}>
                    STANDARD
                  </div>
                  {/* ── HEADER ROW 1-2: one cell per type, spanning both header rows ───────────────
                    * 🔴 THE ⋯ IS `absolute` AT THE RIGHT EDGE AND THE NAME IS CENTRED IN THE WHOLE
                    * CELL. It used to be `ml-auto` in a flex row, which makes it a sibling the name has
                    * to share the width with — so "Street food festival" was pushed left of centre
                    * while "Pub" sat dead centre, and the two headers did not line up with each other
                    * or with the switches under them. Taking the button out of the flow is what lets
                    * every title be centred on its column. */}
                  {types.map((t, i) => (
                    <div key={t.id} data-grid-type-header
                      {...(t.kind === 'private' ? { 'data-private-column': true } : {})}
                      className={`${CELL_DIVIDER} relative px-7 flex items-center justify-center gap-1.5 min-w-0`}
                      style={{ gridColumn: 2 + vanCount + i, gridRow: '1 / span 2', background: WHITE_BG }}>
                      {/* ── 🔴 THE BUILT-IN PRIVATE COLUMN READS AS BUILT-IN (20261014) ────────────
                        * A LOCK instead of a colour dot, and purple text. The dots exist so two
                        * CUSTOM columns can be told apart at a glance; Private is the one column that
                        * is the same on every truck, so a dot would be claiming it is one of theirs.
                        * ⚠️ THE LOCK IS NOT A PLAN BADGE. It means "built in, you cannot rename or
                        * delete this" — the Max badges on the PRICES rows are a different mark in a
                        * different place, and conflating them would tell a Pro truck that the feature
                        * they are entitled to is locked. */}
                      {t.kind === 'private' ? (
                        <span aria-hidden="true" className="text-[11px] leading-none text-purple-500" title={PRIVATE_COLUMN_TITLE}>🔒</span>
                      ) : (
                        <Dot colour={colourFor(i)} />
                      )}
                      <span
                        className={`text-[13px] font-bold truncate ${t.kind === 'private' ? 'text-purple-700' : 'text-slate-800'}`}
                        title={t.kind === 'private' ? PRIVATE_COLUMN_TITLE : t.name}
                      >{t.name}</span>
                      <button type="button" aria-label={`More for ${t.name}`} disabled={!editable}
                        onClick={e => { e.stopPropagation(); setMenuFor(menuFor === t.id ? null : t.id) }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-lg border border-slate-200 text-slate-500 font-bold disabled:text-slate-300 leading-none">⋯</button>
                      {menuFor === t.id && (
                        <div className="absolute right-1 top-[52px] z-10 w-[170px] bg-white rounded-xl shadow-xl border border-slate-100 p-1.5 text-sm text-left"
                          onClick={e => e.stopPropagation()}>
                          {/* ⛔ PRIVATE OFFERS **ONLY** "Match Standard" (20261014, decision 1). Rename,
                            * Move left/right and Delete are absent rather than disabled: a greyed
                            * "Delete" invites the operator to wonder what would unlock it, and the
                            * answer is nothing — it is built in. The server refuses them too (the
                            * rename/delete/move handlers filter on the truck and the id, and
                            * scripts/private-events.cjs asserts the kind check), because the screen
                            * decides what is drawn and the route decides what is done. */}
                          {t.kind !== 'private' && (
                            <>
                          <button type="button" className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50"
                            onClick={() => { setRenaming(t.id); setRenameTo(t.name); setMenuFor(null) }}>Rename</button>
                          {/* ⚠️ DISABLED AT THE ENDS OF THE **CUSTOM** LIST, not of the grid. With
                            * Private at grid index 0, `i === 0` would have disabled Move left on the
                            * first custom type one column too late. */}
                          <button type="button" disabled={customIndexOf(t.id) === 0}
                            className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 disabled:text-slate-300"
                            onClick={() => void move(t.id, -1)}>Move left</button>
                          <button type="button" disabled={customIndexOf(t.id) === customCount - 1}
                            className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 disabled:text-slate-300"
                            onClick={() => void move(t.id, 1)}>Move right</button>
                            </>
                          )}
                          {/* 🔴 THE WAY BACK TO INHERITING, AND THE ONLY ONE. ⚠️ IT CLEARS THE SERVICE
                            * SETTINGS ONLY — prices are not in `SERVICE_KEYS` and `Match Standard`
                            * sends `blankTypeValues()`, which does not name a price column. A type's
                            * prices are turned off by its own switch, which is where an operator is
                            * looking when they want that. Said out loud in the confirm. */}
                          <button type="button" className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50"
                            onClick={() => { setConfirmMatch(t.id); setMenuFor(null) }}>{MATCH_STANDARD_LABEL}</button>
                          {t.kind !== 'private' && (
                            <button type="button" className="block w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-red-700"
                              onClick={() => { setConfirmDelete(t.id); setMenuFor(null) }}>Delete</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* ── HEADER ROW 2: the van names, centred, with NO colour dot ──────────────────
                    * ⛔ NO DOT ON A VAN COLUMN (5 October 2026). The dots exist so two TYPE columns
                    * can be told apart at a glance; every van column carried the same grey
                    * `STANDARD_COLOUR`, so the dot distinguished nothing and made a van column look
                    * like a seventh type. */}
                  {vanHeaders.map((v, i) => (
                    <div key={v.key} data-grid-van-header
                      className={`${CELL_DIVIDER} px-2.5 flex items-center justify-center min-w-0`}
                      style={{ gridColumn: 2 + i, gridRow: 2, height: ROW_H.control, background: WHITE_BG }}>
                      <span className="text-[13px] font-bold text-slate-800 truncate" title={v.name}>{v.name}</span>
                    </div>
                  ))}

                  {/* ── THE BODY ─────────────────────────────────────────────────────────────────── */}
                  {plan.map((r, idx) => {
                    const row = BODY_ROW_1 + idx
                    /* `items-band` IS A SECTION in every respect that matters to the layout — the
                     * darker band, the heading type, the height, and the stripe restarting after it. */
                    const isBand = r.k === 'section' || r.k === 'items-band'
                    const bg = isBand ? SECTION_BG
                      : r.k === 'category' ? WHITE_BG
                      : stripeFor(idx) ? STRIPE_BG : WHITE_BG
                    /* ══ 🔴 `h` IS A **MINIMUM** NOW, NOT A HEIGHT (5 October 2026) ═══════════════
                     * Labels wrap instead of truncating, and a wrapping label needs the row to grow.
                     * Dominic: don't raise ROW_H.control for every row — let a row grow to fit when
                     * its label wraps, 36px staying the minimum. So every body cell sets `minHeight`
                     * and none sets `height`, and the grid's rows are `auto`: the row becomes as tall
                     * as its tallest cell, which is the label when it takes two lines.
                     * ⛔ THE ONE-LINE ROWS ARE UNCHANGED AT 36/28/22/28. `minHeight` with content
                     * shorter than it renders identically to `height` — only a row that needs more
                     * takes more, which is exactly "the other rows stay dense".
                     * ⚠️ `items-center` ON EVERY CELL IS WHAT KEEPS A TALL ROW TIDY: the controls in
                     * the value columns centre against the two-line label rather than sitting at the
                     * top of a 50px box. */
                    const h = isBand ? ROW_H.section
                      : r.k === 'category' ? ROW_H.category
                      : r.k === 'price-item' ? ROW_H.item
                      : ROW_H.control
                    const base = `px-2.5 flex items-center justify-center min-w-0 border-t border-slate-100`

                    // ── THE LABEL CELL ───────────────────────────────────────────────────────────
                    const label = (() => {
                      if (isBand) {
                        return (
                          <div key="l" className={`px-3 flex items-center gap-2 ${SUBCARD_HEADING} border-t border-slate-100`}
                            style={{ gridColumn: 1, gridRow: row, minHeight: h, background: bg }}>
                            <span className="shrink-0">{r.label}</span>
                            {/* ── 🔴 THE MAX BADGE ON THE **PRICES** BAND (20261014) ───────────────
                              * Per-type prices are `event_types` (Max). A Pro truck sees the band and
                              * its rows — so that it knows what Max buys — with the badge beside the
                              * heading and every control in the band disabled.
                              * ⚠️ ON THE BAND, NOT ON EACH OF THE FOUR ROWS. One mark where the
                              * section is named reads as "this section is Max"; four marks read as
                              * four separate locks on four unrelated things. */}
                            {r.id === 'sec-prices' && !canTypes && canPrivate && <MaxBadge />}
                            {/* 🔴 THE PILL, IMMEDIATELY AFTER THE HEADING, INSIDE THE BAND. The grid
                              * scrolls sideways; this is the one position visible at every scroll
                              * offset. It names the COUNT so the operator knows what is unfolding. */}
                            {r.k === 'items-band' && (
                              <button type="button" data-item-prices-toggle
                                onClick={() => setShowItems(v => !v)}
                                className="shrink-0 rounded-full border border-slate-300 bg-white px-2 py-px text-[10px] font-bold text-slate-700 hover:bg-slate-50 normal-case tracking-normal">
                                {/* ⚠️ NO COUNT (5 October 2026). "Show 23 items" offered a number
                                  * nobody acts on, and "items" in a PRICES band invited the reading
                                  * that the band was about availability. */}
                                {showItems
                                  ? `${ITEM_PRICES_HIDE} \u25b4`
                                  : `${ITEM_PRICES_SHOW} \u25be`}
                              </button>
                            )}
                          </div>
                        )
                      }
                      if (r.k === 'category') {
                        /* ══ 🔴 CATEGORY HEADINGS ARE MORE DOMINANT (5 October 2026) ══════════════
                         * PIZZA, DRINKS… were 11px bold slate-500 — lighter than the item names under
                         * them, so a long menu read as one undifferentiated run of rows. They are now
                         * 12px, near-black, extrabold, with a DARKER line above (slate-300 against
                         * the slate-100 every other row uses) so the break is visible before the text
                         * is read.
                         * ⚠️ STILL LIGHTER THAN A SECTION BAND. A band is a grey fill across the whole
                         * width; this is dark text on white with one stronger rule. The hierarchy is
                         * band → category → row, and inverting the last two was the fault. */
                        /* ══ ⛔ NO RULE ABOVE A CATEGORY HEADING (5 October 2026) ══════════════
                         * The first version gave the label cell `border-t border-slate-300` to make
                         * the break stronger. On screen that drew a darker line **only under the
                         * label column**, because the value cells kept `border-slate-100` — a short
                         * stub of dark line stopping at the first divider, which Dominic reported as
                         * looking broken. It was.
                         * 🔴 SO THE ROW HAS NO HORIZONTAL RULE AT ALL — neither here nor on its value
                         * cells. The heading separates the group by being a heading: near-black,
                         * extrabold, 12px small caps. A line is not needed and a HALF line is worse
                         * than none.
                         * ⚠️ THE VERTICAL COLUMN DIVIDERS STILL RUN THROUGH IT, unbroken, which is
                         * the explicit requirement — `CELL_DIVIDER` is on the value cells and is not
                         * a `border-t`, so dropping the horizontal rule does not touch it.
                         * ⚠️ AND `truncate` IS GONE HERE TOO — no ellipsis anywhere. */
                        return (
                          <div key="l" className="px-3 flex items-center text-[12px] font-extrabold text-slate-900 tracking-[0.04em] uppercase leading-tight"
                            style={{ gridColumn: 1, gridRow: row, minHeight: h, background: bg }}>
                            <span>{r.label}</span>
                          </div>
                        )
                      }
                      return (
                        /* 🔴 ITEM NAMES SIT 12px IN FROM THEIR CATEGORY HEADING (5 October 2026).
                         * The heading is at `px-3` (12px); an item is at `pl-6` (24px), so each
                         * category reads as a group rather than as a heading followed by rows that
                         * happen to be below it. ⚠️ `pl-7` STAYS FOR A SUB-ROW ("When offline"), which
                         * is a different and deeper relationship — a setting under a setting, not an
                         * item under a heading. */
                        <div key="l" className={`flex items-center gap-2 border-t border-slate-100 ${
                          r.indent ? 'pl-7 pr-3' : r.k === 'price-item' ? 'pl-6 pr-3' : 'px-3'}`}
                          style={{ gridColumn: 1, gridRow: row, minHeight: h, background: bg }}>
                          {/* ══ 🔴 REGULAR WEIGHT, AND THEY **WRAP** (5 October 2026) ══════════════
                            * Row labels were `font-semibold`; bold now belongs ONLY to section bands
                            * (small caps) and column titles. A screen where every label is bold has
                            * no emphasis left to spend on the headings that organise it.
                            * ⛔ `truncate` IS GONE — NO ELLIPSIS ANYWHERE. It hid the end of the
                            * longest label ("Take orders by private link and QR code") behind a hover
                            * title, which is a tooltip nobody on a tablet can reach. `leading-tight`
                            * is what makes two lines fit the row's height.
                            * ⚠️ SUB-ROWS ARE SLIGHTLY LIGHTER (`slate-600` vs `slate-800`), which is
                            * the only thing left distinguishing "When offline" from its parent now
                            * that the indent is the other one. */}
                          <span className={`min-w-0 flex-1 leading-tight ${r.k === 'price-item'
                            ? 'text-[13.5px] text-slate-700'
                            : r.indent
                              ? 'text-sm text-slate-600'
                              : 'text-sm text-slate-800'}`}>{r.label}</span>
                        </div>
                      )
                    })()

                    // ── THE STANDARD SIDE ────────────────────────────────────────────────────────
                    const standardCells = (() => {
                      /* 🔴 THE HINT LIVES IN THE ITEM PRICES BAND, spanning the van columns — which is
                       * where Dominic asked for it, and it replaces the footer line that used to carry
                       * it. ⚠️ IT STILL DRAWS THE DIVIDER, so the column lines stay continuous
                       * through the band like every other row. */
                      if (r.k === 'items-band') {
                        /* ⛔ THE "Press a price to type your own" HINT IS GONE (5 October 2026). It
                         * was an instruction for something an operator discovers by pressing a price,
                         * occupying the one row in the band that could have said something they could
                         * not discover. Dominic: remove it completely. It survives on the dashboard
                         * sheet, which has room and a different audience.
                         * ⚠️ ONE EMPTY CELL PER VAN COLUMN, so the column lines stay continuous. */
                        return vanHeaders.map((v, i) => (
                          <div key={v.key} className={`${CELL_DIVIDER} border-t border-slate-100`}
                            style={{ gridColumn: 2 + i, gridRow: row, minHeight: h, background: bg }} />
                        ))
                      }
                      if (r.k === 'section' || r.k === 'category') {
                        /* The heading's own value cells: empty, but they draw the column lines.
                         * ⛔ A CATEGORY ROW TAKES **NO** `border-t` (5 October 2026). Giving the label
                         * cell a darker rule and these the usual light one drew a short dark stub that
                         * stopped at the first divider — the "looks broken" Dominic reported. The row
                         * now has no horizontal rule on either side of the grid.
                         * ⚠️ `CELL_DIVIDER` IS NOT A `border-t`, so the VERTICAL column lines still run
                         * through these rows unbroken, which is the requirement. A SECTION band keeps
                         * its rule: it is a grey fill and the line is what seats it. */
                        return vanHeaders.map((v, i) => (
                          <div key={v.key}
                            className={`${CELL_DIVIDER} ${r.k === 'category' ? '' : 'border-t border-slate-100'}`}
                            style={{ gridColumn: 2 + i, gridRow: row, minHeight: h, background: bg }} />
                        ))
                      }
                      /* ── 🔴 PRICES ARE TRUCK-WIDE: **ONE CELL** ACROSS EVERY VAN COLUMN ────────
                       * There is no per-van price column in the database and no per-van meaning — a
                       * truck does not charge £9 from one trailer and £10 from another at the same
                       * pitch. So the Standard side of every PRICES row is one spanning cell, and the
                       * "Change prices" one spans DOWN through the rule rows as well, because "your
                       * menu prices" is the one answer for all four of them.
                       * ⚠️ IT STAYS WHITE. A cell covering four striped rows cannot be two colours. */
                      if (r.k === 'price-switch') {
                        return [(
                          <div key="std" data-prices-standard-cell
                            className={`${CELL_DIVIDER} px-2.5 flex items-center justify-center text-center border-t border-slate-100`}
                            style={{
                              gridColumn: `2 / span ${vanCount}`,
                              gridRow: `${row} / span ${1 + ruleRowCount}`,
                              background: WHITE_BG,
                            }}
                            title={PRICES_TRUCK_WIDE_TITLE}>
                            <span className="text-[13px] text-slate-600">{PRICES_STANDARD_CELL}</span>
                          </div>
                        )]
                      }
                      /* The rule rows have no Standard cell of their own — the span above covers them. */
                      if (r.k === 'price-rule') return []
                      if (r.k === 'price-item') {
                        return [(
                          <div key="std"
                            className={`${CELL_DIVIDER} px-2.5 flex items-center justify-center border-t border-slate-100`}
                            style={{ gridColumn: `2 / span ${vanCount}`, gridRow: row, minHeight: h, background: bg }}
                            title={PRICES_TRUCK_WIDE_TITLE}>
                            <span className={r.k === 'price-item'
                              ? 'text-[13px] text-slate-700 tabular-nums'
                              : 'text-[13px] text-slate-600'}>
                              {r.k === 'price-item' ? `£${r.item.price.toFixed(2)}` : PRICES_MENU_CELL}
                            </span>
                          </div>
                        )]
                      }
                      if (r.k === 'offline-mode') {
                        /* One cell per van, but only where that van's protection is ON. */
                        return vanHeaders.map((v, i) => (
                          <div key={v.key} className={`${CELL_DIVIDER} ${base}`}
                            style={{ gridColumn: 2 + i, gridRow: row, minHeight: h, background: bg }}>
                            {standardOfflineOn(v) && (
                              <Select className="w-full" height={GRID_CONTROL_H} ariaLabel={`${OFFLINE_WHEN_OFFLINE_LABEL} for ${v.name}`}
                                disabled={!canEditStandard} value={standardOfflineMode(v)}
                                options={OFFLINE_MODE_CHOICES.map(c => ({ value: c.value, label: c.label }))}
                                onChange={m => onStandardOfflineMode(v, m)} />
                            )}
                          </div>
                        ))
                      }
                      /* ── 🔴 "Same settings for all vans" — ONE SWITCH, IN THE STANDARD AREA ──────
                       * It spans the van columns because it is a statement about ALL of them, and
                       * because when it is ON there is only one column to put it in anyway. Blank in
                       * every type column, as instructed: a type is not a van and has no vans to make
                       * the same.
                       * 🔴 OFF → ON ASKS FIRST, because it OVERWRITES: it copies Van 1's settings over
                       * every other van's, through the same action Settings' switch calls. ON → OFF
                       * asks nothing and copies nothing — every van keeps what it has. */
                      /* ── 🔴 "Take orders by private link and QR code" — STANDARD SAYS WHAT IS TRUE
                       * Standard events are open to everyone, so there is nothing to switch. The cell
                       * is a STATEMENT across the van columns, not a switch that could only ever be
                       * off — a disabled switch here would invite a tap and read as "we have turned
                       * private ordering off for Standard", which means nothing.
                       * ⚠️ IT SPANS THE VAN COLUMNS for the same reason "Same settings" does: it is
                       * one fact about the whole Standard side, not a per-van setting. */
                      if (r.k === 'private-link') {
                        /* ══ ⛔ BLANK ON THE STANDARD SIDE (5 October 2026) ══════════════════════
                         * It said "Open to everyone" across the van columns. True, and the only cell
                         * in the grid that was a sentence rather than a value — so it read as a
                         * setting whose value was words, and invited a search for the control that
                         * changed it. Dominic: remove it; only Private's cell has anything.
                         * ⚠️ ONE EMPTY CELL PER VAN COLUMN, NOT ONE SPANNING CELL. The column lines
                         * must stay continuous through this row like every other; a single spanning
                         * cell would draw one divider where there should be two. */
                        return vanHeaders.map((v, i) => (
                          <div key={v.key} data-private-link-standard
                            className={`${CELL_DIVIDER} border-t border-slate-100`}
                            style={{ gridColumn: 2 + i, gridRow: row, minHeight: h, background: bg }} />
                        ))
                      }
                      if (r.k === 'same-settings') {
                        return [(
                          <div key="std" data-same-settings-cell
                            className={`${CELL_DIVIDER} ${base}`}
                            style={{ gridColumn: `2 / span ${vanCount}`, gridRow: row, minHeight: h, background: bg }}>
                            <Toggle on={sameSettings} disabled={!canEditStandard} compact
                              ariaLabel={SAME_SETTINGS_ALL_VANS_LABEL}
                              onToggle={() => {
                                if (sameSettings) void saveSameSettings(false)
                                else setConfirmSameSettings(true)
                              }} />
                          </div>
                        )]
                      }
                      /* ── A SERVICE row: ONE CELL PER VAN COLUMN, EVERY ROW ────────────────────
                       * ⛔ THE `truckLevel` BRANCH IS GONE (5 October 2026). It existed for exactly
                       * one row — "Do you take cash?" — which was `trucks.takes_cash`, one column for
                       * the whole truck, so every van column's switch wrote the same value and they
                       * moved together. That is the defect Dominic met on localhost.
                       * `truck_vans.takes_cash` (20261012) makes cash a van setting like the other
                       * four, so EVERY service row is now per van and there is no exception left to
                       * branch on — and no "Applies to all your vans" title to explain one.
                       * ⚠️ `v.van` NULL IS THE COMBINED COLUMN (one van, or "All vans" when the
                       * same-settings switch is on), and it writes EVERY active van — which is what
                       * that column has always meant. */
                      const sr = r.row
                      return vanHeaders.map((v, i) => (
                        <div key={v.key} className={`${CELL_DIVIDER} ${base} gap-2`}
                          style={{ gridColumn: 2 + i, gridRow: row, minHeight: h, background: bg }}>
                          <OneStandardControl row={sr} editable={canEditStandard} dense
                            value={v.van ? vanValue(sr, v.van) : standardValue(sr, standard)}
                            label={`${sr.label} for ${v.name}`}
                            onChange={value => (v.van
                              ? void saveStandardForVan(sr, v.van.id, value)
                              : void saveStandard(sr, value))} />
                        </div>
                      ))
                    })()

                    // ── THE TYPE COLUMNS ─────────────────────────────────────────────────────────
                    const typeCells = types.map((t, i) => {
                      const col = 2 + vanCount + i
                      const cellStyle = { gridColumn: col, gridRow: row, minHeight: h, background: bg }
                      if (isBand || r.k === 'category') {
                        /* ⛔ NO `border-t` ON A CATEGORY ROW — see the Standard side's note. The
                         * vertical divider stays. */
                        return (
                          <div key={t.id}
                            className={`${CELL_DIVIDER} ${r.k === 'category' ? '' : 'border-t border-slate-100'}`}
                            style={cellStyle} />
                        )
                      }
                      const pr = pricing[t.id]
                      const on = pr?.price_change_on === true
                      const setup = setupOf(pr)
                      if (r.k === 'price-switch') {
                        return (
                          <div key={t.id} className={`${CELL_DIVIDER} ${base}`} style={cellStyle}>
                            <Toggle on={on} disabled={!editable} compact
                              ariaLabel={`${PRICE_SETTING_LABELS.price_change_on} for ${t.name}`}
                              onToggle={() => patchPricing(t.id, { price_change_on: !on })} />
                          </div>
                        )
                      }
                      if (r.k === 'price-rule') {
                        /* 🔴 CONTROLS ONLY IN COLUMNS WHOSE SWITCH IS ON; THE REST ARE BLANK CELLS.
                         * Not disabled controls — blank. A greyed dropdown in an off column invites
                         * the operator to try to use it, and reads as "this type's rule is None"
                         * rather than "this type does not change prices".
                         *
                         * ══ 🔴 AND "None" BLANKS THE AMOUNT AND THE ROUNDING TOO (5 October 2026) ══
                         * `'none'` means TYPED PRICES ONLY — there is no across-the-board change, so
                         * there is no amount to enter and nothing for a rounding to round. An empty
                         * input and a faded select there were two controls that could not affect
                         * anything, and the Amount box in particular invited a number that
                         * `cleanPriceAmount` would then discard (its unit is `null` for this mode).
                         * ⚠️ THE STORED VALUES ARE NOT CLEARED, only hidden: switching back to "+ %"
                         * brings the operator's amount and rounding back, which is the same promise
                         * the "Change prices" switch itself makes. */
                        /* ⚠️ DERIVED FROM `PRICE_MODES_WITH_AMOUNT`, not from `!== 'none'`. Same
                         * answer today; the difference is that a sixth mode cannot be added without
                         * deciding which side of this it falls on, because the list is built from
                         * `PRICE_MODE_CHOICES` itself. */
                        const ruleLive = on && PRICE_MODES_WITH_AMOUNT.includes(pr!.price_mode ?? '')
                        return (
                          <div key={t.id} className={`${CELL_DIVIDER} ${base}`} style={cellStyle}>
                            {on && r.which === 'mode' && (
                              <PriceModeSelect value={pr!.price_mode} disabled={!editable} height={GRID_CONTROL_H}
                                label={`${PRICE_SETTING_LABELS.price_mode} for ${t.name}`}
                                /* ⚠️ THE MODE AND THE AMOUNT ARE SENT TOGETHER, so the route validates
                                 * the stored amount against the NEW unit — "10" meant as £10 must not
                                 * survive a switch to "+ %" as 10%. `cleanPriceAmount` re-checks it
                                 * against the ceiling of the new unit and nulls it if it cannot hold. */
                                onChange={m => patchPricing(t.id, { price_mode: m, price_amount: pr!.price_amount })} />
                            )}
                            {ruleLive && r.which === 'amount' && (
                              <PriceAmountInput mode={pr!.price_mode} value={pr!.price_amount} disabled={!editable} height={GRID_CONTROL_H}
                                label={`${PRICE_SETTING_LABELS.price_amount} for ${t.name}`}
                                onCommit={v => patchPricing(t.id, { price_amount: v, price_mode: pr!.price_mode })} />
                            )}
                            {ruleLive && r.which === 'rounding' && (
                              <PriceRoundingSelect value={pr!.price_rounding} disabled={!editable} height={GRID_CONTROL_H}
                                /* ══ ⛔ THE FADE IS GONE (5 October 2026) ═══════════════════════════
                                 * It was faded while the value was still `'none'`, on the argument
                                 * that a crisp "None" would read as a choice the operator had made
                                 * when it was only the column default.
                                 * 🔴 DOMINIC: NOTHING GREYED OR FADED ANYWHERE — "None" in Rounding
                                 * looks like any normal value. And the old argument was weak: "no
                                 * rounding" IS the value this rule uses, whoever chose it, so showing
                                 * it at half strength told the operator their rule was somehow not
                                 * settled. The ONLY grey left in this grid is a menu price in a column
                                 * that is not changing prices, which is a statement of fact rather
                                 * than a control at reduced strength. */
                                label={`${PRICE_SETTING_LABELS.price_rounding} for ${t.name}`}
                                onChange={v => patchPricing(t.id, { price_rounding: v })} />
                            )}
                          </div>
                        )
                      }

                      if (r.k === 'price-item') {
                        return (
                          <div key={t.id} className={`${CELL_DIVIDER} ${base}`} style={cellStyle}>
                            {/* 🔴 THE PRICE SHOWN IS `priceForItem` — THE FUNCTION THE SUBMIT ROUTE
                              * CHARGES WITH (inside <PriceCell>). An off type shows the MENU price in
                              * grey and is not pressable: `grey` is the fact, not a disabled control. */}
                            <PriceCell menuPrice={r.item.price} setup={setup} itemId={r.item.id}
                              typed={on ? pr!.typed[r.item.id] ?? null : null}
                              grey={!on} disabled={!editable} height={GRID_TYPED_H}
                              /* 🔴 THE DIFFERENCE IS A **TYPE COLUMN** THING ONLY (5 October 2026).
                               * Standard IS the menu price, so the brackets there would always be
                               * absent — but passing it only here means the Standard column cannot
                               * start showing them if a default ever changes. */
                              showDiff
                              label={`${r.item.name} for ${t.name}`}
                              onType={v => setTypeItemPrice(t.id, r.item.id, v)}
                              onClear={() => setTypeItemPrice(t.id, r.item.id, null)} />
                          </div>
                        )
                      }
                      /* ── 🔴 THE LINK/QR SWITCH LIVES IN THE **PRIVATE** COLUMN AND NOWHERE ELSE ──
                       * ⚠️ BLANK IN EVERY CUSTOM TYPE'S COLUMN, not a disabled switch: a Festival is
                       * not private and has no link to switch, so there is nothing here to be on or
                       * off. Same argument as the "Same settings" cell below.
                       * ⛔ AND IT IS A `private_events` (Pro) CONTROL, NOT A MAX ONE. A Pro truck can
                       * use this row while the PRICES rows above it carry a Max badge — which is the
                       * whole reason the two keys were split (lib/features.ts). */
                      if (r.k === 'private-link') {
                        return (
                          <div key={t.id} className={`${CELL_DIVIDER} ${base}`} style={cellStyle}>
                            {t.kind === 'private' && (
                              <Toggle
                                on={t.private_link_ordering !== false}
                                disabled={!privateEditable}
                                compact
                                ariaLabel={`${PRIVATE_LINK_ROW_LABEL} for ${t.name}`}
                                onToggle={() => void saveLinkOrdering(t.private_link_ordering === false)}
                              />
                            )}
                          </div>
                        )
                      }
                      /* ⚠️ BLANK IN A TYPE COLUMN, NOT A DISABLED SWITCH. A type has no vans, so
                       * there is nothing here to be on or off — and a greyed control would invite a
                       * tap and read as "off for this type", which would mean nothing. */
                      if (r.k === 'same-settings') {
                        return <div key={t.id} className={`${CELL_DIVIDER} ${base}`} style={cellStyle} />
                      }
                      if (r.k === 'offline-mode') {
                        return (
                          <div key={t.id} className={`${CELL_DIVIDER} ${base}`} style={cellStyle}>
                            {typeOfflineOn(t) && (
                              <Select className="w-full" height={GRID_CONTROL_H} ariaLabel={`${OFFLINE_WHEN_OFFLINE_LABEL} for ${t.name}`}
                                disabled={!editable} value={typeOfflineMode(t, standard)}
                                /* ⛔ NO FADE (5 October 2026). A faded mode meant "this type has no
                                 * mode of its own, so you are looking at Standard's" — the subscription
                                 * that made Market move when Van 1 moved, in miniature. A type holds
                                 * its own values; a pre-backfill NULL is still SHOWN at the value that
                                 * will be used, crisp. The only fade left on this screen is the price
                                 * Rounding, where the column is NOT NULL and there is genuinely no
                                 * other way to say "not chosen". */
                                options={OFFLINE_MODE_CHOICES.map(c => ({ value: c.value, label: c.label }))}
                                onChange={m => patch(t.id, { offline_protection: true, offline_protection_mode: m })} />
                            )}
                          </div>
                        )
                      }
                      return (
                        <div key={t.id} className={`${CELL_DIVIDER} ${base} gap-2`} style={cellStyle}>
                          <TypeControl row={r.row} type={t} standard={standard} editable={editable} dense
                            onPatch={v => patch(t.id, v)} />
                        </div>
                      )
                    })

                    return <Fragment key={r.id}>{label}{standardCells}{typeCells}</Fragment>
                  })}
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

      {/* ── 🔴 SAME SETTINGS FOR ALL VANS — THE OFF → ON CONFIRM ─────────────────────────────────
        * It asks because it OVERWRITES: turning it on copies Van 1's settings over every other van's,
        * so a truck that had configured Van 2 differently loses that. Cancel leaves everything exactly
        * as it was — nothing is written until Copy is pressed.
        * ⚠️ THE WORDING NAMES KITCHEN CAPACITY'S SEPARATE SWITCH, because `VAN_COPY_FIELDS` and
        * `CAPACITY_COPY_FIELDS` are disjoint and capacity does NOT travel with this. An operator who
        * expected it to would otherwise think the copy had half-failed. */}
      {confirmSameSettings && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setConfirmSameSettings(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 space-y-3" data-same-settings-confirm>
            <p className="font-bold text-slate-900">{SAME_SETTINGS_ALL_VANS_LABEL}</p>
            <p className="text-sm text-slate-600">{SAME_SETTINGS_CONFIRM}</p>
            <div className="flex gap-2 justify-end">
              <Btn label="Cancel" colour="slate" size="sm" onClick={() => setConfirmSameSettings(false)} />
              <Btn label="Copy Van 1’s settings" size="sm" disabled={!editable || standardBusy}
                onClick={() => void saveSameSettings(true)} />
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
              * TYPE's columns only — and an operator about to press it should not have to guess.
              * ⚠️ AND PRICES ARE NOT TOUCHED EITHER (5 October). They are not service columns and are
              * not in `SERVICE_KEYS`; a type's prices are turned off by its own switch. */}
            <p className="text-xs text-slate-500">
              Anything you changed on a single event’s dashboard stays as it is, and this type’s prices
              are not changed.
            </p>
            {/* 🔴 WHAT THE COPY WILL ACTUALLY BE, BEFORE IT IS PRESSED. `vanOneValues` is the SERVER'S
              * own `vanOneServiceValues` — the same values `match_standard` will write — summarised by
              * `summariseType`, the same function the Add event picker uses. So the sentence the
              * operator reads here and the row that lands are one computation, not two.
              * ⚠️ IT IS NOT DERIVED FROM `standard` ON THIS SCREEN. That aggregate is "the first van's
              * value plus a do-they-agree flag" and is the right input for DRAWING a column; it is not
              * the thing the route copies, and using it here would let the promise and the write
              * disagree about a truck whose vans differ. */}
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              It will use: {summariseType(vanOneValues as unknown as TypeFor)}
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
            {/* ══ 🔴 THE COUNT LIVES HERE NOW (5 October 2026) ════════════════════════════════════
              * It was a row at the bottom of the grid ("USED BY / Upcoming events"), on screen all the
              * time for a number that matters at one moment. This is that moment.
              * 🔴 IT SAYS WHAT HAPPENS TO THE EVENTS, because that is the only thing a truck needs to
              * know before pressing it. `on delete set null` is what makes it true.
              * ⚠️ THE ZERO CASE READS DIFFERENTLY, deliberately: "No upcoming events use Festival" is
              * the reassurance that makes the button safe to press, where "0 upcoming events use
              * Festival. They'll go back to Standard." is a sentence about nothing. */}
            <p className="text-sm text-slate-600">
              {(typeById.get(confirmDelete)?.upcoming ?? 0) === 0
                ? <>No upcoming events use “{typeById.get(confirmDelete)?.name ?? 'this type'}”.</>
                : <>
                    {typeById.get(confirmDelete)?.upcoming} upcoming event
                    {(typeById.get(confirmDelete)?.upcoming ?? 0) === 1 ? '' : 's'} use
                    {(typeById.get(confirmDelete)?.upcoming ?? 0) === 1 ? 's' : ''}{' '}
                    “{typeById.get(confirmDelete)?.name ?? 'this type'}”. They’ll go back to Standard.
                  </>}
              {' '}Anything you changed on a single event stays as it is.
            </p>
            <div className="flex gap-2 justify-end">
              <Btn label="Keep" colour="slate" size="sm" onClick={() => setConfirmDelete(null)} />
              <Btn label="Delete" colour="red" size="sm" disabled={!editable}
                onClick={() => void act({ action: 'delete', id: confirmDelete }, () => setConfirmDelete(null))} />
            </div>
          </div>
        </div>
      )}
    </>
  )

  /* 🔴 INLINE: the card goes straight into the page's flow. OVERLAY: the same card, inside the
   * backdrop that closes it. The popups travel with it either way — they are `fixed` themselves, so
   * they are correct in both shells. */
  return inline ? content : (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      {content}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1a · ONE ROW OF THE GRID
// ════════════════════════════════════════════════════════════════════════════════════════════════

/* ── ⛔ `SettingRow` IS DELETED, AND ITS DELETION IS THE POINT ─────────────────────────────────────
 * It rendered one row — the label, then the Standard cells, then one cell per type — as a React
 * fragment, letting CSS grid AUTO-PLACE every cell. That worked while every row was the same shape.
 * It cannot survive this build, for two reasons that are the same reason:
 *
 *   • THE ROWS ARE NO LONGER ALL THE SAME SHAPE. "Your menu prices" spans the van columns AND four
 *     rows; the STANDARD heading spans the van columns; each type's header spans two rows; the
 *     category and section headings need an empty cell PER COLUMN so the vertical rules do not stop
 *     at them. Under auto-placement one span shifts every later cell by a column, and it shifts it
 *     differently for a one-van truck than for a three-van truck.
 *   • THE STRIPE AND THE HEIGHT ARE PROPERTIES OF THE ROW'S POSITION IN THE WHOLE GRID, not of the
 *     row itself. A component rendering one row cannot know whether it is the third row since the
 *     last heading.
 *
 * 🔴 SO THE GRID PLANS ITS ROWS (`plan`) AND DRAWS THEM WITH EXPLICIT `gridRow` / `gridColumn`. The
 * pieces `SettingRow` used — `vanValue`, `standardValue`, `OneStandardControl`, `TypeControl` — all
 * survive below and are called directly by the grid and by the phone cards. Leaving the component
 * behind would leave the auto-placement design in the file for someone to reach for.
 */

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
  /* ⚠️ A BOOLEAN NOW, NOT `enabled ? mode : 'off'`. The row is a switch; the mode lives in the
   * "When offline" sub-row and is read by `standardOfflineMode`. */
  if (row.id === 'offline_protection') return v.offline_enabled
  if (row.id === 'buzzer_prompt') return v.buzzer_prompt
  /* 🔴 CASH IS A VAN VALUE NOW (5 October 2026). It used to fall through to `standardValue`, which
   * returned the ONE truck value for every column — the defect. */
  if (row.id === 'takes_cash') return v.takes_cash
  return v.order_ready
}

/** Standard's aggregate value for a row, in the shape the control wants. */
function standardValue(row: ServiceRow, standard: StandardValues): boolean | number | string {
  if (row.id === 'collection_interval_mins') return standard.collection_interval_mins.value
  if (row.id === 'offline_protection') return standard.offline_protection.enabled
  return standardSwitchValue(row, standard)
}

/**
 * ONE Standard control — a switch or a dropdown, both from the shared primitives.
 *
 * ⚠️ THE SAME COMPONENT WHETHER IT WRITES ONE VAN OR ALL OF THEM. Only `value` and `onChange` differ,
 * which is what stops a van column and a single Standard column looking like two kinds of thing.
 */
function OneStandardControl({ row, value, label, title, editable, onChange, dense = false }: {
  row: ServiceRow
  value: boolean | number | string
  label: string
  /**
   * ⚠️ THE GRID IS DENSE; THE PHONE CARDS ARE NOT. This component is rendered by both, and a 28px
   * select with a 38×22 switch is right in a 36px grid row and wrong in a phone card's tap target.
   * `false` by default, so the phone cards are unchanged and only the grid passes it.
   */
  dense?: boolean
  /** Hover text. Used for the truck-level row, where the same setting appears in every van column. */
  title?: string
  editable: boolean
  onChange: (value: boolean | number | string) => void
}) {
  if (row.kind === 'interval') {
    return (
      <Select className="flex-1" height={dense ? GRID_CONTROL_H : undefined} ariaLabel={label} disabled={!editable}
        value={String(value)} title={title ?? `Every ${value} min`}
        options={TYPE_INTERVAL_CHOICES.map(n => ({ value: String(n), label: `Every ${n} min` }))}
        onChange={v => onChange(Number(v))} />
    )
  }
  /* ⚠️ NO `offline` BRANCH ANY MORE — IT FALLS THROUGH TO THE SWITCH BELOW. `kind: 'offline'` still
   * distinguishes the row (it owns three columns, and the grid emits a "When offline" sub-row after
   * it), but its CONTROL is now the same switch every other boolean row has. See the note above
   * `OFFLINE_MODE_CHOICES`. */
  return (
    <Toggle on={value === true} disabled={!editable} compact={dense} ariaLabel={label} title={title}
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
function TypeControl({ row, type, standard, editable, onPatch, dense = false }: {
  row: ServiceRow
  type: TypeRow
  standard: StandardValues
  editable: boolean
  onPatch: (values: Record<string, unknown>) => void
  /** ⚠️ The grid only — the phone card keeps the full-size controls. See `OneStandardControl`. */
  dense?: boolean
}) {
  /* ══ 🔴 A TYPE HOLDS ITS OWN VALUES. NOTHING HERE "FOLLOWS STANDARD" ANY MORE ══════════════════
   * Dominic, 5 October 2026: "Service rows no longer draw faded 'following' values. Every cell is
   * that column's own value. Changing Standard never changes a type."
   *
   * ⛔ WHAT THIS REPLACES, AND WHY IT HAD TO GO. A NULL column was drawn FADED at Standard's value,
   * which meant the cell was showing **somebody else's setting**. On localhost that produced the
   * second half of his report: turning cash on for Van 1 "showed Market changing" — Market had never
   * had a cash value of its own; it was displaying Van 1's, and Van 1's had moved. The fade said
   * "inherited", and no fade has ever made that reading safe at a glance on a grid of forty switches.
   *
   * 🔴 THE FIX IS AT CREATION, NOT ON THIS SCREEN: a new type is a COPY of Van 1's resolved values
   * (`vanOneServiceValues`, server-side), so every column has a real value and there is nothing left
   * to inherit. `Match Standard` re-copies on demand. This component therefore shows the type's own
   * value, crisp, and a Standard edit cannot reach it.
   *
   * ⚠️ THE RESOLVER CHAIN IS UNCHANGED AND STILL FALLS BACK. Every type that exists TODAY has NULLs,
   * and until 20261012's backfill is run those rows must resolve exactly as they do now. So a NULL is
   * still DISPLAYED at the value that will actually be used — it is just not faded, because "faded"
   * promised a subscription that no longer exists. After the backfill there are no NULLs left.
   * ⚠️ THE FADED STYLE SURVIVES IN EXACTLY ONE PLACE: an untouched price Rounding, where
   * `price_rounding` is NOT NULL DEFAULT 'none' and the screen genuinely has no other way to say "the
   * operator has not chosen this". That is the pricing build's own rule and it is not affected.
   */
  if (row.kind === 'interval') {
    const shown = type.collection_interval_mins
      ?? (standardIsPerVan(row, standard) ? TYPE_INTERVAL_CHOICES[0] : standard.collection_interval_mins.value)
    return (
      <Select className="flex-1" height={dense ? GRID_CONTROL_H : undefined} ariaLabel={`${row.label} for ${type.name}`} disabled={!editable}
        value={String(shown)} title={`Every ${shown} min`}
        options={TYPE_INTERVAL_CHOICES.map(n => ({ value: String(n), label: `Every ${n} min` }))}
        onChange={v => onPatch({ collection_interval_mins: Number(v) })} />
    )
  }

  if (row.kind === 'offline') {
    /* ── 🔴 A SWITCH, ON THIS TYPE'S OWN VALUE ─────────────────────────────────────────────────────
     * ⚠️ TAPPING WRITES **ONLY THE SWITCH**. The mode is left exactly as stored, which is what the
     * "When offline" sub-row then shows and edits — turning protection off and on again must not
     * silently change what it does. */
    const explicitOff = type.offline_protection === true || type.offline_protection === false
    const shownOffline = explicitOff
      ? type.offline_protection === true
      : standard.offline_protection.enabled
    return (
      <Toggle on={shownOffline} disabled={!editable} compact={dense}
        ariaLabel={`${row.label} for ${type.name}`}
        onToggle={() => onPatch({ offline_protection: !shownOffline })} />
    )
  }

  // ── A SWITCH ──────────────────────────────────────────────────────────────────────────────────
  const key = row.keys[0]
  const stored = (type as unknown as Record<string, unknown>)[key] as boolean | null | undefined
  const explicit = stored === true || stored === false
  /* ⚠️ A PRE-BACKFILL NULL IS SHOWN AT THE VALUE THAT WILL BE USED — the resolver still falls back —
   * but it is NOT faded, because nothing subscribes any more. See the note above. */
  const shown = explicit ? stored === true : standardSwitchValue(row, standard)

  return (
    <Toggle on={shown} disabled={!editable} compact={dense}
      ariaLabel={`${row.label} for ${type.name}`}
      /* ⚠️ TAPPING STORES THE OPPOSITE OF WHAT IT SHOWS, which is what a switch does. */
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
        /* ⛔ NO `truckLevel` BRANCH (5 October 2026). Cash became a van setting, so every service row
         * is per van and there is no exception left — see the grid's note. */
        const value = van ? vanValue(row, van) : standardValue(row, standard)
        return (
          <div key={row.id}>
            <div className="flex items-center justify-between gap-3 text-sm py-1.5 border-t border-slate-100">
              <span className="text-slate-700 min-w-0 flex-1">
                {row.label}
  
              </span>
              <span className="flex items-center gap-2 shrink-0 max-w-[55%]">
                <OneStandardControl row={row} editable={canEdit} value={value}
                  label={`${row.label} for ${van ? van.name : 'Standard'}`}
                  onChange={v => (van ? onStandardVan(row, van.id, v) : onStandard(row, v))} />
              </span>
            </div>
            {/* 🔴 THE "When offline" SUB-ROW ON A PHONE TOO. The switch and the mode are one setting
              * to an operator, and a phone that offered the switch without the mode would be a phone
              * on which protection could be armed but not configured — on the one device this is used
              * on at the hatch. Indented, and absent when the switch is off, exactly as in the grid. */}
            {row.id === 'offline_protection' && value === true && (
              <div className="flex items-center justify-between gap-3 text-sm pl-4 pb-1.5">
                <span className="text-[13px] font-semibold text-slate-700 min-w-0 flex-1">{OFFLINE_WHEN_OFFLINE_LABEL}</span>
                <span className="shrink-0 max-w-[55%]">
                  <Select className="w-full" ariaLabel={`${OFFLINE_WHEN_OFFLINE_LABEL} for ${van ? van.name : 'Standard'}`}
                    disabled={!canEdit}
                    value={van ? van.offline_mode : (standard.offline_protection.mode ?? 'pause')}
                    options={OFFLINE_MODE_CHOICES.map(c => ({ value: c.value, label: c.label }))}
                    onChange={m => (van ? onStandardVan(row, van.id, m) : onStandard(row, m))} />
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** One type on a phone. The same controls, stacked. */
function TypeCard({ type, standard, editable, colour, pricing, onPatch, onPatchPricing, onRename, onDelete }: {
  type: TypeRow
  standard: StandardValues
  editable: boolean
  colour: string
  /** This type's pricing, or undefined before 20261011 is applied (⇒ no price rows at all). */
  pricing: TypePricingRow | undefined
  onPatch: (values: Record<string, unknown>) => void
  onPatchPricing: (values: Record<string, unknown>) => void
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
      {/* ── 🔴 PRICES ON A PHONE: THE RULE, BUT NOT FORTY ITEM ROWS ─────────────────────────────────
        * The switch, the mode, the amount and the rounding are four rows and fit; the per-item grid
        * is one row per dish across every type's column, which is unreadable at 390px — it is the
        * reason the tablet layout scrolls sideways in the first place.
        * ⚠️ IT IS NOT LOST ON A PHONE, AND THE LINE SAYS WHERE IT IS. An operator standing at a
        * festival who needs to price ONE dish has the dashboard's "Prices for this event" sheet,
        * which is full-screen on a phone by design and is the per-event surface they want anyway.
        * This card is the truck-wide, per-TYPE setup, which is a sit-down job. */}
      {pricing && (
        <>
          <div className="py-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-600">{PRICE_SETTING_LABELS.price_change_on}</span>
            <Toggle on={pricing.price_change_on} disabled={!editable}
              ariaLabel={`${PRICE_SETTING_LABELS.price_change_on} for ${type.name}`}
              onToggle={() => onPatchPricing({ price_change_on: !pricing.price_change_on })} />
          </div>
          {pricing.price_change_on && (
            <>
              <div className="py-1.5 flex items-center justify-between gap-2 pl-4">
                <span className="text-xs font-bold text-slate-600">{PRICE_SETTING_LABELS.price_mode}</span>
                <span className="w-[130px] shrink-0">
                  <PriceModeSelect value={pricing.price_mode} disabled={!editable}
                    label={`${PRICE_SETTING_LABELS.price_mode} for ${type.name}`}
                    onChange={m => onPatchPricing({ price_mode: m, price_amount: pricing.price_amount })} />
                </span>
              </div>
              <div className="py-1.5 flex items-center justify-between gap-2 pl-4">
                <span className="text-xs font-bold text-slate-600">{PRICE_SETTING_LABELS.price_amount}</span>
                <span className="w-[130px] shrink-0">
                  <PriceAmountInput mode={pricing.price_mode} value={pricing.price_amount} disabled={!editable}
                    label={`${PRICE_SETTING_LABELS.price_amount} for ${type.name}`}
                    onCommit={v => onPatchPricing({ price_amount: v, price_mode: pricing.price_mode })} />
                </span>
              </div>
              <div className="py-1.5 flex items-center justify-between gap-2 pl-4">
                <span className="text-xs font-bold text-slate-600">{PRICE_SETTING_LABELS.price_rounding}</span>
                <span className="w-[130px] shrink-0">
                  {/* ⛔ NO FADE HERE EITHER (5 October 2026). The phone card carried the same faded
                    * Rounding as the grid, for the same reason, and it goes for the same reason —
                    * "nothing greyed or faded anywhere". A rule the grid obeys and the phone card
                    * does not is a rule that lasts until somebody opens the phone card. */}
                  <PriceRoundingSelect value={pricing.price_rounding} disabled={!editable}
                    label={`${PRICE_SETTING_LABELS.price_rounding} for ${type.name}`}
                    onChange={v => onPatchPricing({ price_rounding: v })} />
                </span>
              </div>
              <p className="text-[11px] text-slate-400 pl-4 pb-1">
                {Object.keys(pricing.typed).length} typed price
                {Object.keys(pricing.typed).length === 1 ? '' : 's'} · set them on a bigger screen, or
                for one event on its dashboard.
              </p>
            </>
          )}
        </>
      )}
      {SERVICE_ROWS.map(row => (
        <div key={row.id} className="py-1.5 border-t border-slate-100">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-slate-600">{row.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <TypeControl row={row} type={type} standard={standard} editable={editable} onPatch={onPatch} />
          </div>
          {/* The same "When offline" sub-row the grid and the Standard card have. */}
          {row.id === 'offline_protection'
            && (type.offline_protection ?? standard.offline_protection.enabled) === true && (
            <div className="flex items-center justify-between gap-2 pl-4 pt-1.5">
              <span className="text-[13px] font-semibold text-slate-700">{OFFLINE_WHEN_OFFLINE_LABEL}</span>
              <span className="w-[160px] shrink-0">
                <Select className="w-full" ariaLabel={`${OFFLINE_WHEN_OFFLINE_LABEL} for ${type.name}`}
                  /* ⛔ NO FADE — see the grid's note on the same control. */
                  disabled={!editable}
                  value={type.offline_protection_mode ?? standard.offline_protection.mode ?? 'pause'}
                  options={OFFLINE_MODE_CHOICES.map(c => ({ value: c.value, label: c.label }))}
                  onChange={m => onPatch({ offline_protection: true, offline_protection_mode: m })} />
              </span>
            </div>
          )}
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

        {/* ⚠️ "A COPY OF", NOT "THE SAME AS" (5 October 2026). The promise is the same on the day the
          * type is made and DIFFERENT afterwards, which is the whole change: the type now holds its
          * own values, so changing Standard later does not change it. Saying "starts exactly like
          * Standard" was true and became misleading the moment an operator changed Standard — which is
          * the report this build answers. */}
        <p className="text-[13px] text-slate-500">
          Tap a name or type your own. It starts as a copy of Standard, and changing Standard later
          won’t change it. Change anything after.
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
export function EventTypeSelect({
  token, venueName, placeId, value, onChange, disabled, privateName, onPrivateName,
}: {
  token: string
  /** The venue typed into the form — the fallback when no place is picked. */
  venueName: string | null | undefined
  /**
   * 🔴 THE PICKED PLACE, AND IT OUTRANKS THE NAME. "The usual type for this place" means the most
   * recent event at the SAME PLACE, resolved server-side through `placeForEvent` — which follows
   * `merged_into_id`, so a pitch the operator merged counts as one pitch. Null (nothing picked, or a
   * truck that has never opened the places list) falls back to the normalised-name rule, which is
   * what every event without a place still matches on.
   */
  placeId: string | null | undefined
  value: string | null
  onChange: (typeId: string | null) => void
  disabled?: boolean
  /**
   * ── 🔴 THE PRIVATE EVENT'S NAME, OWNED BY THE FORM (5 October 2026) ────────────────────────────
   * The panel that collects it belongs to this control — selecting Private is what reveals it — but
   * the VALUE belongs to the form, which is what saves it. So it is lifted, like `value`.
   * ⚠️ BOTH OPTIONAL: the approval card passes them and so does Add/Edit event; a caller that does
   * not is simply a caller for whom Private is not selectable.
   */
  privateName?: string | null
  onPrivateName?: (name: string) => void
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

  /* The usual type for this place, debounced — it is a database read per venue name.
   * ⚠️ `placeId` IS IN THE DEPENDENCIES AND IS NOT DEBOUNCED AWAY: picking a place in the picker is a
   * single deliberate press, not typing, so the answer should follow it immediately on the next tick
   * rather than 350ms later. The timer is still there because the VENUE BOX is typed into. */
  useEffect(() => {
    const name = String(venueName ?? '').trim()
    /* ⚠️ THE DISABLE IS ON THIS LINE, NOT ON THE TIMER BELOW. Clearing the remembered answer the moment
     * the venue box is emptied is the correct behaviour — a stale "usual for this place" hint under a
     * blank venue would be wrong — and it is a synchronous setState in an effect, which is what the
     * rule flags. The debounced write inside the timer is asynchronous and needs no disable. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if ((!name && !placeId) || types.length === 0) { setUsual(null); return }
    const t = setTimeout(async () => {
      try {
        const r = await api(token, { action: 'usual_for_venue', venueName: name, placeId: placeId ?? null })
        setUsual((r.typeId as string | null) ?? null)
      } catch { setUsual(null) }
    }, placeId ? 0 : 350)
    return () => clearTimeout(t)
  }, [token, venueName, placeId, types.length])

  /* ⚠️ THE DEFAULT IS APPLIED IN AN EFFECT because it depends on a read that finishes later. It fires
   * only while untouched and only when it would actually change the value. */
  useEffect(() => {
    if (touched.current || !usual || value) return
    onChange(usual)
  }, [usual, value, onChange])

  /* ══ ⛔ THE FIELD IS DRAWN EVEN FOR A TRUCK WITH NO CUSTOM TYPES (5 October 2026) ════════════════
   * It used to return null when `types` was empty, on the argument that a field with one option
   * teaches nothing. That was right when the only options were Standard and the truck's own types.
   * 🔴 IT IS WRONG NOW, BECAUSE **PRIVATE** IS ALWAYS ONE OF THE CHOICES. A truck with no custom
   * types still has Standard and Private, which is a real two-way choice with a real consequence —
   * and hiding it was exactly the bug this section fixes from the other side: the separate "Private
   * event" tick existed because this control could not express Private.
   * ⚠️ IT STILL RETURNS NULL BEFORE THE TYPES HAVE LOADED, so the form does not flash a Standard-only
   * row and then grow. */
  if (!ready) return null

  const selected = types.find(t => t.id === value) ?? null
  const isUsual = !!usual && usual === (value ?? null)
  const privateType = types.find(t => t.kind === 'private') ?? null
  const customTypes = types.filter(t => t.kind !== 'private')
  const privateChosen = !!privateType && value === privateType.id

  /* ⛔ ONE SELECTED PILL, ALWAYS. `value === null` is Standard, which is the absence of a type — so
   * Standard is a pill like any other and "nothing selected" is not a state this control has. */
  const pill = (key: string, label: string, on: boolean, kind: 'standard' | 'private' | 'custom', onPress: () => void) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={() => { touched.current = true; onPress() }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        on
          ? kind === 'private'
            ? 'border-purple-400 bg-purple-100 text-purple-900'
            : 'border-slate-900 bg-slate-900 text-white'
          : kind === 'private'
            ? 'border-purple-300 bg-white text-purple-700 hover:bg-purple-50'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
    >
      {kind === 'private' && <span aria-hidden="true">🔒</span>}
      {label}
    </button>
  )

  return (
    <div data-event-type-select>
      {/* ⚠️ A `radiogroup`, NOT A LIST OF BUTTONS. Exactly one is selected, which is what a radio group
        * means — and it is what makes the control reachable with arrow keys rather than only by tap. */}
      <p className="mb-1 block text-xs font-bold text-slate-600" id="event-type-pills-label">Event type</p>
      <div role="radiogroup" aria-labelledby="event-type-pills-label"
        data-event-type-pills className="flex flex-wrap gap-1.5">
        {pill('standard', 'Standard', value === null, 'standard', () => onChange(null))}
        {/* 🔴 PRIVATE IS SECOND, STRAIGHT AFTER STANDARD — the same position it has on the grid, so a
          * truck finds it in the same place on both screens. */}
        {privateType && pill(privateType.id, privateType.name, privateChosen, 'private', () => onChange(privateType.id))}
        {customTypes.map(t => pill(t.id, t.name, value === t.id, 'custom', () => onChange(t.id)))}
      </div>
      {/* The "(usual for this place)" hint, and a one-line summary of what the type changes. */}
      <p className="mt-1 text-xs text-slate-500">
        {isUsual && (
          <span className="font-semibold text-slate-600">
            {selected ? `${selected.name} is usual for this place. ` : 'Standard is usual for this place. '}
          </span>
        )}
        {!privateChosen && summariseType(selected)}
      </p>

      {/* ══ 🔴 THE PURPLE PANEL, DIRECTLY BELOW THE PILLS (5 October 2026) ═══════════════════════════
        * ⛔ THIS REPLACES THE SEPARATE "Private event" TICK, AND THAT TICK WAS THE BUG. The dropdown
        * offered "Private" while a tick existed beside it, and choosing Private in the dropdown left
        * the tick unticked — two controls for one fact, which could disagree. One control now owns it:
        * selecting the Private pill IS making the event private.
        * ⚠️ IT OPENS AND CLOSES WITH THE PILL. Selecting any other type closes it, and the name field
        * unmounts with it — so a name typed and then abandoned cannot be saved against a public event.
        * ⚠️ THE TWO SENTENCES ARE ONE BLOCK, then the name field. Dominic moved the link/QR sentence up
        * on 5 October: they are one answer to one question and the input used to sit between them. */}
      {privateChosen && (
        <div className="mt-2 rounded-xl border border-purple-200 bg-purple-50 p-3" data-private-panel>
          <p className="text-[11px] leading-relaxed text-purple-800">{PRIVATE_TICK_HELP}</p>
          <p className="mt-1 text-[11px] font-semibold leading-relaxed text-purple-900">{PRIVATE_LINK_PROMISE}</p>
          <div className="mt-3 border-t border-purple-200 pt-3">
            <label className="mb-1 block text-xs font-bold text-purple-900" htmlFor="private-name-input">
              {PRIVATE_NAME_LABEL}
            </label>
            <input
              id="private-name-input"
              type="text"
              maxLength={80}
              value={privateName ?? ''}
              disabled={disabled}
              onChange={e => onPrivateName?.(e.target.value)}
              placeholder={PRIVATE_NAME_PLACEHOLDER}
              className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <p className="mt-1 text-[11px] text-purple-800">{PRIVATE_NAME_HELP}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ 3 · THE DASHBOARD CONTROL — DELETED (5 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// `EventTypeDashboardControl` and its `OwnSettings` interface stood here: 130 lines of a dropdown and
// a confirm for switching a LIVE event's type from the Dashboard board.
//
// 🔴 IT HAD NO CALLER. The "This event" card took that job over
// (app/dashboard/[token]/page.tsx — see the note at the card), and the standalone control was left
// exported, compiled into every bundle that imports this module, and reachable by nobody.
// ⛔ DEAD CODE THAT STILL COMPILES IS WORSE THAN DEAD CODE THAT DOES NOT: it keeps answering "yes,
// that exists" to anyone searching for how a live event's type is changed, and it would have to be
// kept in step with the resolvers it no longer feeds.
// ⚠️ `OwnSettings` WENT WITH IT. It was exported, and it was this component's prop type and nothing
// else — app/dashboard/[token]/page.tsx declares the same four booleans inline, which is the shape
// `/api/dashboard` actually returns.
//
// 🧪 Asserted ABSENT, across the whole file, by scripts/event-types.cjs. The behaviour it carried —
// a live event's type can be switched, and the confirm says what changes — is the "This event" card's
// now, and the harness checks it there.
