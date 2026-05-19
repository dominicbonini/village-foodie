'use client'
// components/dashboard/DealsModal.tsx
// Unified deal selection modal for both truck dashboard and customer ordering

import { useState } from 'react'

interface Bundle {
  name: string
  description: string
  bundle_price: number
  original_price: number | null
  slot_1_category: string | null
  slot_2_category: string | null
  slot_3_category: string | null
  slot_4_category: string | null
  slot_5_category: string | null
  slot_6_category: string | null
  start_time?: string | null
  end_time?: string | null
}

interface MenuItem {
  name: string
  category: string
  price: number
  available?: boolean
}

interface BasketItem {
  name: string
  quantity: number
  unit_price?: number
  cartKey?: string
  modifiers?: { name: string; price: number }[]
}

interface SlotModifierOption { id: string; name: string; price_adjustment: number }
interface SlotModifierGroup { id: string; name: string; options: SlotModifierOption[] }
interface MenuCategory { name: string; allowNotes?: boolean; modifierGroups?: SlotModifierGroup[] }

function getBundleSlotCats(bundle: Bundle): string[] {
  return [
    bundle.slot_1_category,
    bundle.slot_2_category,
    bundle.slot_3_category,
    bundle.slot_4_category,
    bundle.slot_5_category,
    bundle.slot_6_category,
  ].filter((c): c is string => c !== null)
}

export function DealsModal({
  bundles,
  menuItems,
  basketItems,
  menuCategories,
  onApply,
  onClose,
  existingDeals = [],
}: {
  bundles: Bundle[]
  menuItems: MenuItem[]
  basketItems: BasketItem[]
  menuCategories?: MenuCategory[]
  onApply: (
    deal: Bundle,
    slots: Record<string, string>,
    dealPrice: number,
    discountAmt: number,
    rawSlots: Record<string, string>,
    modifierExtra: number,
    slotModifiers: Record<string, { name: string; price: number }[]>,
    slotNotes: Record<string, string>
  ) => void
  onClose: () => void
  existingDeals?: Array<{ bundle: Bundle; slots: Record<string, string>; itemsTakenFromBasket?: string[] }>
}) {
  const [selectedDeal, setSelectedDeal] = useState<Bundle | null>(bundles.length === 1 ? bundles[0] : null)
  const [slotSelections, setSlotSelections] = useState<Record<string, string>>({})
  const [slotMods, setSlotMods] = useState<Record<string, { name: string; price: number }[]>>({})
  const [slotNotes, setSlotNotes] = useState<Record<string, string>>({})

  const itemKey = (b: BasketItem) => b.cartKey || b.name

  const getModGroups = (itemName: string): SlotModifierGroup[] => {
    if (!menuCategories) return []
    const item = menuItems.find(m => m.name === itemName)
    if (!item) return []
    return menuCategories.find(c => c.name === item.category)?.modifierGroups || []
  }

  const getAllowNotes = (itemName: string): boolean => {
    if (!menuCategories) return false
    const item = menuItems.find(m => m.name === itemName)
    if (!item) return false
    return menuCategories.find(c => c.name === item.category)?.allowNotes ?? false
  }

  const selectDeal = (bundle: Bundle) => {
    setSelectedDeal(bundle)
    setSlotMods({})
    setSlotNotes({})
    const prefill: Record<string, string> = {}
    getBundleSlotCats(bundle).forEach(cat => {
      const match = basketItems.find(b => menuItems.find(m => m.name === b.name)?.category === cat)
      if (match) prefill[cat] = `USE_EXISTING:${itemKey(match)}`
    })
    setSlotSelections(prefill)
  }

  const toggleSlotMod = (cat: string, opt: SlotModifierOption) => {
    setSlotMods(prev => {
      const cur = prev[cat] || []
      const already = cur.some(m => m.name === opt.name)
      return {
        ...prev,
        [cat]: already
          ? cur.filter(m => m.name !== opt.name)
          : [...cur, { name: opt.name, price: opt.price_adjustment }],
      }
    })
  }

  const applyDeal = () => {
    if (!selectedDeal) return
    const cats = getBundleSlotCats(selectedDeal)
    if (!cats.every(c => slotSelections[c])) return

    const cleanSlots: Record<string, string> = {}
    const rawSlots: Record<string, string> = {}
    const slotModifiers: Record<string, { name: string; price: number }[]> = {}
    let originalPrice = 0
    let modifierExtra = 0

    cats.forEach(cat => {
      const raw = slotSelections[cat]
      rawSlots[cat] = raw
      const isExisting = raw.startsWith('USE_EXISTING:')
      const identifier = raw.replace('USE_EXISTING:', '')
      const dealModalMods = slotMods[cat] || []
      const dealModalCost = dealModalMods.reduce((s, m) => s + m.price, 0)

      if (isExisting) {
        const basketItem = basketItems.find(b => itemKey(b) === identifier)
        const displayName = basketItem?.name || identifier
        cleanSlots[cat] = displayName
        const basePrice = menuItems.find(m => m.name === displayName)?.price ?? 0
        const totalPrice = basketItem?.unit_price ?? basePrice
        originalPrice += totalPrice + dealModalCost
        modifierExtra += Math.max(0, totalPrice - basePrice) + dealModalCost
        const combined = [...(basketItem?.modifiers || []), ...dealModalMods]
        if (combined.length) slotModifiers[cat] = combined
      } else {
        cleanSlots[cat] = identifier
        originalPrice += (menuItems.find(m => m.name === identifier)?.price ?? 0) + dealModalCost
        modifierExtra += dealModalCost
        if (dealModalMods.length) slotModifiers[cat] = dealModalMods
      }
    })

    const effectiveDealPrice = selectedDeal.bundle_price + modifierExtra
    const discount = Math.max(0, originalPrice - effectiveDealPrice)

    onApply(selectedDeal, cleanSlots, effectiveDealPrice, discount, rawSlots, modifierExtra, slotModifiers, slotNotes)
  }

  const fullyUsedKeys = new Set<string>(
    existingDeals.flatMap(d => d.itemsTakenFromBasket || [])
  )

  // Live button price
  let buttonPrice = selectedDeal?.bundle_price ?? 0
  if (selectedDeal) {
    getBundleSlotCats(selectedDeal).forEach(cat => {
      const raw = slotSelections[cat]
      if (!raw) return
      const isExisting = raw.startsWith('USE_EXISTING:')
      const identifier = raw.replace('USE_EXISTING:', '')
      if (isExisting) {
        const basketItem = basketItems.find(b => itemKey(b) === identifier)
        const basePrice = menuItems.find(m => m.name === basketItem?.name)?.price ?? 0
        buttonPrice += Math.max(0, (basketItem?.unit_price ?? basePrice) - basePrice)
      }
      buttonPrice += (slotMods[cat] || []).reduce((s, m) => s + m.price, 0)
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            {selectedDeal && bundles.length > 1 && (
              <button onClick={() => setSelectedDeal(null)} className="text-orange-600 text-sm font-bold flex items-center gap-1 mb-1">
                ← Back
              </button>
            )}
            <h3 className="font-black text-slate-900">
              {selectedDeal ? selectedDeal.name : 'Apply a deal'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center shrink-0">×</button>
        </div>

        {!selectedDeal ? (
          // ── Deal list ──────────────────────────────────────────────────────────
          <div className="space-y-3">
            {bundles.map(bundle => {
              const cats = getBundleSlotCats(bundle)
              const saving = bundle.original_price && bundle.original_price > 0
                ? bundle.original_price - bundle.bundle_price : null
              return (
                <button key={bundle.name} onClick={() => selectDeal(bundle)}
                  className="w-full text-left border border-slate-200 rounded-xl p-3 hover:border-orange-300 hover:bg-orange-50 transition-all active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <p className="font-black text-slate-900 text-sm mb-0.5">{bundle.name}</p>
                      <p className="text-slate-500 text-xs">{bundle.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-orange-600">£{bundle.bundle_price.toFixed(2)}</p>
                      {saving && saving > 0 && (
                        <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Save £{saving.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cats.map(cat => {
                      const inBasket = basketItems.some(b => menuItems.find(m => m.name === b.name)?.category.toLowerCase() === cat.toLowerCase())
                      return (
                        <span key={cat} className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${inBasket ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {cat}{inBasket ? ' ✓' : ''}
                        </span>
                      )
                    })}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          // ── Slot picker ────────────────────────────────────────────────────────
          <div>
            <div className="border border-orange-200 bg-orange-50 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between">
                <p className="text-slate-700 text-xs font-bold">{selectedDeal.description}</p>
                <p className="font-black text-orange-600 text-sm">£{selectedDeal.bundle_price.toFixed(2)}</p>
              </div>
            </div>

            <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Select items for each slot</p>

            {getBundleSlotCats(selectedDeal).map(cat => {
              const allOpts = menuItems.filter(i => i.category.toLowerCase() === cat.toLowerCase())
              const inBasketOpts = basketItems.filter(b => allOpts.some(m => m.name === b.name))
              const isFilled = !!slotSelections[cat]

              const raw = slotSelections[cat] || ''
              const isExisting = raw.startsWith('USE_EXISTING:')
              const identifier = raw.replace('USE_EXISTING:', '')
              const selectedItemName = isExisting
                ? (basketItems.find(b => itemKey(b) === identifier)?.name || identifier)
                : identifier
              const modGroups = isFilled && selectedItemName ? getModGroups(selectedItemName) : []
              const currentSlotMods = slotMods[cat] || []
              const currentNote = slotNotes[cat] || ''

              return (
                <div key={cat} className="mb-5">
                  {/* Slot label */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${isFilled ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {isFilled ? '✓' : ''}
                    </span>
                    <label className="text-xs font-black text-slate-700 uppercase">{cat}</label>
                    {inBasketOpts.length > 0 && (
                      <span className="text-[10px] text-green-600 font-bold">({inBasketOpts.length} in basket)</span>
                    )}
                  </div>

                  {/* Item picker dropdown */}
                  <select
                    value={slotSelections[cat] || ''}
                    onChange={e => {
                      setSlotSelections(prev => ({ ...prev, [cat]: e.target.value }))
                      setSlotMods(prev => ({ ...prev, [cat]: [] }))
                      setSlotNotes(prev => ({ ...prev, [cat]: '' }))
                    }}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 ${isFilled ? 'border-green-300' : 'border-slate-200'}`}>
                    <option value="">Choose {cat}…</option>

                    {inBasketOpts.length > 0 && <option disabled>── In your basket ──</option>}
                    {inBasketOpts.map(b => {
                      const key = itemKey(b)
                      const isUsed = fullyUsedKeys.has(key)
                      const modLabel = b.modifiers?.length ? ` (+ ${b.modifiers.map(m => m.name).join(', ')})` : ''
                      return (
                        <option key={`USE_EXISTING:${key}`} value={`USE_EXISTING:${key}`} disabled={isUsed}>
                          {b.name}{modLabel} (in basket){isUsed ? ' — already in a deal' : ''}
                        </option>
                      )
                    })}

                    {inBasketOpts.length > 0 && <option disabled>── Add new ──</option>}
                    {allOpts.map(item => (
                      <option key={item.name} value={item.name}>
                        {item.name} £{item.price.toFixed(2)}
                      </option>
                    ))}
                  </select>

                  {/* Inline modifier upsells — compact chips */}
                  {isFilled && modGroups.length > 0 && (
                    <div className="mt-2.5 space-y-2.5">
                      {modGroups.map(group => (
                        <div key={group.id}>
                          {modGroups.length > 1 && (
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-1.5">{group.name}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {group.options.map(opt => {
                              const isSelected = currentSlotMods.some(m => m.name === opt.name)
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => toggleSlotMod(cat, opt)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all active:scale-95 ${
                                    isSelected
                                      ? 'border-orange-500 bg-orange-500 text-white'
                                      : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300'
                                  }`}>
                                  <span>{opt.name}</span>
                                  <span className={isSelected ? 'text-orange-200' : 'text-orange-500'}>+£{opt.price_adjustment.toFixed(2)}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes field — only shown if category allows notes */}
                  {isFilled && getAllowNotes(selectedItemName) && (
                    <div className="mt-2">
                      <input
                        type="text"
                        maxLength={60}
                        value={currentNote}
                        onChange={e => setSlotNotes(prev => ({ ...prev, [cat]: e.target.value }))}
                        placeholder="Add a note, e.g. no onions (optional)"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 bg-white"
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Savings panel */}
            {getBundleSlotCats(selectedDeal).every(c => slotSelections[c]) && (() => {
              let orig = 0
              getBundleSlotCats(selectedDeal).forEach(cat => {
                const raw = slotSelections[cat]
                const isEx = raw?.startsWith('USE_EXISTING:')
                const id = raw?.replace('USE_EXISTING:', '') || ''
                if (isEx) {
                  const b = basketItems.find(bi => itemKey(bi) === id)
                  orig += b?.unit_price ?? (menuItems.find(m => m.name === b?.name)?.price ?? 0)
                } else {
                  orig += menuItems.find(m => m.name === id)?.price ?? 0
                }
                orig += (slotMods[cat] || []).reduce((s, m) => s + m.price, 0)
              })
              const saving = Math.max(0, orig - buttonPrice)
              return saving > 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-center">
                  <p className="text-green-700 font-black text-sm">Save £{saving.toFixed(2)}</p>
                  <p className="text-green-600 text-xs">£{orig.toFixed(2)} → £{buttonPrice.toFixed(2)}</p>
                </div>
              ) : null
            })()}

            <div className="flex gap-2">
              <button onClick={bundles.length > 1 ? () => setSelectedDeal(null) : onClose}
                className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">
                {bundles.length > 1 ? 'Back' : 'Cancel'}
              </button>
              <button onClick={applyDeal}
                disabled={!getBundleSlotCats(selectedDeal).every(c => slotSelections[c])}
                className="flex-1 bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm disabled:opacity-40">
                Apply deal · £{buttonPrice.toFixed(2)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
