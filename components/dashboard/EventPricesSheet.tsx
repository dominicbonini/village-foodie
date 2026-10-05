'use client'
// components/dashboard/EventPricesSheet.tsx — "Prices for this event".
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SAME CONTROLS AND THE SAME ARITHMETIC AS THE EVENT TYPES GRID
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Dominic, 5 October 2026: "Same controls, components and arithmetic as the grid — no second
// implementation." So every control here is from `components/shared/PriceControls.tsx` (the three rule
// controls and `<PriceCell>`, which is where the typed-price box and its × live), and every price
// shown is `priceForItem` from `lib/event-pricing/price.ts` — the function the submit route charges
// with. This file lays out a panel; it decides no money.
//
// ── 🔴 WHY IT IS ITS OWN FILE ─────────────────────────────────────────────────────────────────────
// `app/dashboard/[token]/page.tsx` is ~6,000 lines and is the screen Pizzeria Gusto trades on, and
// `ThisEventCard.tsx` carries its own note about that. This is mounted from one line in the card's
// parent and owns everything else — the load, the draft, the search, the save.
//
// ── 🔴 IT IS A DRAFT UNTIL "Save prices", AND THAT IS WHY IT IS NOT THE GRID ──────────────────────
// The grid SAVES AS YOU GO (its own subtitle promises so): it sets a truck-wide preset, and there is
// nothing in flight to get wrong. This is one event, often a LIVE one, where the next order through
// the hatch is at whatever is stored — so a half-typed rule must not reach a customer. Everything
// here is local state until Save, Cancel discards it, and the save is ONE write.

import { useEffect, useMemo, useState } from 'react'
/* ⚠️ THE THREE RULE CONTROLS AND `<PriceCell>` — NOT `Select` DIRECTLY. The two selects on this
 * panel ARE that shared `Select` (it is what `PriceModeSelect` and `PriceRoundingSelect` render), so
 * the WebKit 23px problem is handled once, inside them, rather than once per caller. */
import {
  PriceAmountInput, PriceCell, PriceModeSelect, PriceRoundingSelect,
} from '@/components/shared/PriceControls'
import {
  priceForItem, summarisePricing, toPence,
  type PriceMode, type PriceRounding, type PriceSetup,
} from '@/lib/event-pricing/price'
import {
  PRICES_SHEET_TITLE, PRICES_SHEET_SAVE, PRICES_CHOICE_OWN, PRICES_CHOICE_MENU,
  PRICES_LIVE_NOTICE, PRICES_SEARCH_PLACEHOLDER, PRICE_TYPE_HINT,
  PRICE_SETTING_LABELS, PRICES_MENU_CELL,
} from '@/lib/copy/serviceSettings'
import { CONTROL_BOX, ORANGE_SOLID } from '@/lib/ui-tokens'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE ROUTE SENDS
// ════════════════════════════════════════════════════════════════════════════════════════════════

interface Setup {
  price_mode: PriceMode
  price_amount: number | null
  price_rounding: PriceRounding
  /** POUNDS by `menu_items_db.id`. */
  typed: Record<string, number>
}

interface Loaded {
  event: { id: string; name: string; date: string | null; status: string | null }
  live: boolean
  typeId: string | null
  typeName: string | null
  own: boolean
  eventSetup: Setup
  typeSetup: (Setup & { price_change_on: boolean }) | null
  menu: { categories: { id: string; name: string; items: { id: string; name: string; price: number }[] }[] }
}

const asSetup = (s: Setup): PriceSetup =>
  ({ mode: s.price_mode, amount: s.price_amount, rounding: s.price_rounding, typed: s.typed })

const gbp = (pence: number): string => `£${(pence / 100).toFixed(2)}`

/** A blank setup — "no rule, nothing typed", which is the menu. */
const BLANK: Setup = { price_mode: 'none', price_amount: null, price_rounding: 'none', typed: {} }

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SHEET
// ════════════════════════════════════════════════════════════════════════════════════════════════

export function EventPricesSheet({ token, eventId, onClose, onSaved }: {
  token: string
  eventId: string
  onClose: () => void
  /** Called after a successful save or clear, so the card's summary and count re-read. */
  onSaved: () => void
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /* 🔴 THE DRAFT. `own` is the two-way choice; `draft` is the rule and the typed prices under it. */
  const [own, setOwn] = useState(false)
  const [draft, setDraft] = useState<Setup>(BLANK)
  const [query, setQuery] = useState('')

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/event-types', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...body }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Something went wrong')
    return j
  }

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const r = (await post({ action: 'load_event_pricing', eventId })) as Loaded
        if (!live) return
        setLoaded(r)
        setOwn(r.own === true)
        setDraft(r.own ? r.eventSetup : BLANK)
      } catch (e) { if (live) setErr(e instanceof Error ? e.message : 'Could not load prices') }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, eventId])

  /* ── 🔴 CHOOSING "Own prices" SEEDS A **COPY** OF WHAT IS IN FORCE TODAY ────────────────────────
   * Decision 4: own prices REPLACE the type's whole, so if the choice started blank an operator who
   * only wanted to knock 50p off one dish would silently lose the type's "+10%, nearest £1" for
   * every other dish on the menu — and nothing on screen would have said so.
   *
   * So the copy happens HERE, at the moment of choosing, once:
   *   • the type's current setup (rule AND typed prices) when its switch is on;
   *   • the MENU (a blank setup) when the type's switch is off, or there is no type.
   * After this the two are independent and editing the type does not reach this event, which is what
   * `resolvePricing` enforces at read time. The copy is a UI act, deliberately — doing it by merging
   * at read time would mean an operator who REMOVED a typed price here silently got the type's back.
   * ⚠️ IT ONLY SEEDS WHEN THE EVENT HAS NO OWN PRICES YET. Toggling back and forth must not wipe a
   * setup the operator has already saved for this event.
   */
  const chooseOwn = () => {
    if (!loaded) return
    setOwn(true)
    if (loaded.own) { setDraft(loaded.eventSetup); return }
    const from = loaded.typeSetup?.price_change_on ? loaded.typeSetup : null
    setDraft(from
      ? { price_mode: from.price_mode, price_amount: from.price_amount, price_rounding: from.price_rounding, typed: { ...from.typed } }
      : { ...BLANK, typed: {} })
  }

  const typeSetup = loaded?.typeSetup?.price_change_on ? asSetup(loaded.typeSetup) : null
  const draftSetup = useMemo(() => asSetup(draft), [draft])

  /** The label on the left-hand choice: the type's name when it has prices, else "Menu prices". */
  const followLabel = typeSetup && loaded?.typeName
    ? `${loaded.typeName}’s prices`
    : PRICES_CHOICE_MENU

  const categories = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!loaded) return []
    if (!q) return loaded.menu.categories
    /* ⚠️ A CATEGORY WITH NO MATCHES DISAPPEARS, rather than showing an empty heading. Searching for
     * "pizza" should not leave "Drinks" on the screen with nothing under it. */
    return loaded.menu.categories
      .map(c => ({ ...c, items: c.items.filter(i => i.name.toLowerCase().includes(q)) }))
      .filter(c => c.items.length > 0)
  }, [loaded, query])

  const typedCount = Object.keys(draft.typed).length

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      if (!own) {
        /* 🔴 CHOOSING THE TYPE / THE MENU **CLEARS** THE EVENT'S OWN PRICES — the columns AND the
         * rows. Leaving the rows would resurrect every typed price the moment "Own prices" was chosen
         * again, which the operator would read as the clear not having worked. */
        await post({ action: 'clear_event_pricing', eventId })
      } else {
        /* ⚠️ ONE WRITE, AND IT CARRIES THE WHOLE INTENDED STATE — the rule and the complete typed map.
         * The route replaces this event's typed rows rather than merging, because this is a FORM: a
         * price the operator removed has to disappear, which a per-row upsert cannot express. */
        await post({
          action: 'save_event_pricing', eventId,
          price_mode: draft.price_mode,
          price_amount: draft.price_amount,
          price_rounding: draft.price_rounding,
          typed: draft.typed,
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save prices')
    } finally { setBusy(false) }
  }

  const setTyped = (itemId: string, price: number | null) => {
    setDraft(d => {
      const typed = { ...d.typed }
      /* 🔴 CLEARING IS A **DELETE FROM THE MAP**, NOT A ZERO. The only way to say "use the rule for
       * this item" is for the key to be absent; £0 is a real and different instruction. */
      if (price === null) delete typed[itemId]
      else typed[itemId] = price
      return { ...d, typed }
    })
  }

  return (
    /* ── 🔴 A RIGHT-SIDE PANEL ON DESKTOP AND iPad, FULL SCREEN ON A PHONE ────────────────────────
      * `inset-0` plus `sm:left-auto sm:w-[560px]` is the whole of it: one element, two shapes, no
      * duplicate markup and no breakpoint-specific component. A phone gets the full width because a
      * 560px panel on a 390px screen is a panel with a 170px gutter you cannot reach past.
      * ⚠️ `max-w-full` SO THE 560 NEVER BEATS THE VIEWPORT on an iPad in portrait. */
    <div className="fixed inset-0 z-[70] flex" role="dialog" aria-modal="true" aria-label={PRICES_SHEET_TITLE}
      data-event-prices-sheet>
      {/* The backdrop closes it, like every other panel on this screen. */}
      <button type="button" aria-label="Close" onClick={() => { if (!busy) onClose() }}
        className="hidden sm:block flex-1 bg-black/40" />
      <div className="bg-white w-full sm:w-[560px] max-w-full h-full flex flex-col shadow-2xl">

        {/* ── HEADER ─────────────────────────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-start gap-3 px-4 py-3.5 border-b border-slate-200">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900 text-lg">{PRICES_SHEET_TITLE}</p>
            <p className="text-[13px] text-slate-500 truncate">{loaded?.event.name ?? '…'}</p>
          </div>
          <button type="button" onClick={() => { if (!busy) onClose() }} aria-label="Close"
            className="shrink-0 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">✕</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {err && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
          {!loaded && !err && <p className="text-sm text-slate-400">Loading…</p>}

          {loaded && (
            <>
              {/* ── 🔴 THE LIVE-EVENT NOTICE ──────────────────────────────────────────────────────
                * Both sentences are true of the implementation: a new order prices at request time
                * through `loadEventPriceBook`, and a placed order's prices are the ones stored on its
                * row — price-lock, which nothing in this feature writes to. It keys on the event's
                * STATUS, resolved server-side, so the screen and the server agree about "live". */}
              {loaded.live && (
                <p data-prices-live-notice
                  className="text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  ⚠️ {PRICES_LIVE_NOTICE}
                </p>
              )}

              {/* ── THE TWO-WAY CHOICE ──────────────────────────────────────────────────────────
                * ⚠️ `role="radiogroup"` AND TWO `aria-checked` BUTTONS, not two bare buttons. It is a
                * choice between two states, and a screen reader has to be able to say which is on. */}
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={PRICES_SHEET_TITLE}>
                <button type="button" role="radio" aria-checked={!own} onClick={() => setOwn(false)}
                  className={`text-left rounded-xl border-2 px-3 py-2.5 ${!own
                    ? 'border-orange-400 bg-orange-50/40 ring-2 ring-orange-300'
                    : 'border-slate-200 hover:border-orange-300'}`}>
                  <span className="block text-sm font-bold text-slate-900">{followLabel}</span>
                  <span className="block text-[12px] text-slate-500">
                    {typeSetup
                      ? summarisePricing({ setup: typeSetup, basis: 'event_type' }, loaded.typeName, Object.keys(typeSetup.typed).length)
                      : 'Charge exactly what your menu says'}
                  </span>
                </button>
                <button type="button" role="radio" aria-checked={own} onClick={chooseOwn}
                  className={`text-left rounded-xl border-2 px-3 py-2.5 ${own
                    ? 'border-orange-400 bg-orange-50/40 ring-2 ring-orange-300'
                    : 'border-slate-200 hover:border-orange-300'}`}>
                  <span className="block text-sm font-bold text-slate-900">{PRICES_CHOICE_OWN}</span>
                  <span className="block text-[12px] text-slate-500">
                    {/* ⚠️ IT SAYS WHERE THE COPY COMES FROM **BEFORE** IT IS MADE, so "it replaces the
                      * type's prices whole" is not a surprise discovered after pressing. */}
                    {loaded.own
                      ? summarisePricing({ setup: asSetup(draft), basis: 'event' }, null, typedCount)
                      : typeSetup ? `Starts as a copy of ${loaded.typeName}` : 'Starts from your menu prices'}
                  </span>
                </button>
              </div>

              {own && (
                <>
                  {/* ── THE RULE, SIDE BY SIDE ──────────────────────────────────────────────────── */}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="block text-xs font-bold text-slate-600 mb-1">{PRICE_SETTING_LABELS.price_mode}</span>
                      <PriceModeSelect value={draft.price_mode} label={PRICE_SETTING_LABELS.price_mode}
                        onChange={m => setDraft(d => ({ ...d, price_mode: m }))} />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-bold text-slate-600 mb-1">{PRICE_SETTING_LABELS.price_amount}</span>
                      <PriceAmountInput mode={draft.price_mode} value={draft.price_amount}
                        label={PRICE_SETTING_LABELS.price_amount}
                        onCommit={v => setDraft(d => ({ ...d, price_amount: v }))} />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-bold text-slate-600 mb-1">{PRICE_SETTING_LABELS.price_rounding}</span>
                      <PriceRoundingSelect value={draft.price_rounding} label={PRICE_SETTING_LABELS.price_rounding}
                        onChange={v => setDraft(d => ({ ...d, price_rounding: v }))} />
                    </label>
                  </div>

                  {/* ── FIND AN ITEM ──────────────────────────────────────────────────────────────
                    * 🔴 A SEARCH, NOT A SCROLL. A truck with sixty dishes and one price to change is
                    * the case this sheet is opened for most often, mid-service, on an iPad. */}
                  <input type="search" value={query} onChange={e => setQuery(e.target.value)}
                    placeholder={PRICES_SEARCH_PLACEHOLDER} aria-label={PRICES_SEARCH_PLACEHOLDER}
                    className={`w-full h-10 ${CONTROL_BOX}`} />

                  {/* ── THE ITEMS, BY CATEGORY ──────────────────────────────────────────────────── */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    {/* ⚠️ THE `<Type>` COLUMN IS OMITTED WHEN THERE IS NO TYPE WITH PRICES, rather than
                      * drawn empty — an empty column of dashes is a column that teaches nothing and
                      * takes a third of the width on a phone. */}
                    <div className={`grid ${typeSetup ? 'grid-cols-[1fr_64px_64px_84px]' : 'grid-cols-[1fr_64px_84px]'} gap-1 px-2.5 py-1.5 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wide`}>
                      <span>Item</span>
                      <span className="text-center">{PRICES_MENU_CELL}</span>
                      {typeSetup && <span className="text-center truncate" title={loaded.typeName ?? ''}>{loaded.typeName}</span>}
                      <span className="text-center">This event</span>
                    </div>
                    {categories.length === 0 && (
                      <p className="px-2.5 py-3 text-sm text-slate-400">Nothing matches “{query}”.</p>
                    )}
                    {categories.map(c => (
                      <div key={c.id}>
                        <p className="px-2.5 py-1 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wide border-y border-slate-100">
                          {c.name}
                        </p>
                        {c.items.map(it => {
                          const menuPence = toPence(it.price)
                          return (
                            <div key={it.id}
                              className={`grid ${typeSetup ? 'grid-cols-[1fr_64px_64px_84px]' : 'grid-cols-[1fr_64px_84px]'} gap-1 items-center px-2.5 py-1 border-b border-slate-50 last:border-b-0`}>
                              <span className="text-[13px] text-slate-800 truncate" title={it.name}>{it.name}</span>
                              <span className="text-[13px] text-slate-400 tabular-nums text-center">{gbp(menuPence)}</span>
                              {typeSetup && (
                                /* The type's price, for comparison only — not editable here. The grid
                                 * is where a TYPE's prices are set. */
                                <span className="text-[13px] text-slate-400 tabular-nums text-center">
                                  {gbp(priceForItem(menuPence, typeSetup, it.id))}
                                </span>
                              )}
                              <span className="flex items-center justify-center">
                                <PriceCell menuPrice={it.price} setup={draftSetup} itemId={it.id}
                                  typed={draft.typed[it.id] ?? null}
                                  label={`${it.name} for this event`}
                                  onType={v => setTyped(it.id, v)}
                                  onClear={() => setTyped(it.id, null)} />
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-slate-200 px-4 py-3 flex items-center gap-2">
          <p className="text-[13px] text-slate-500 flex-1">{own ? PRICE_TYPE_HINT : ''}</p>
          <button type="button" onClick={onClose} disabled={busy}
            className="bg-slate-100 text-slate-700 text-sm px-4 py-2 font-bold rounded-xl disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy || !loaded}
            className={`${ORANGE_SOLID} text-sm px-4 py-2 font-bold rounded-xl disabled:opacity-50`}>
            {busy ? 'Saving…' : PRICES_SHEET_SAVE}
          </button>
        </div>
      </div>
    </div>
  )
}
