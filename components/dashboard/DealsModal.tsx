'use client'
// components/dashboard/DealsModal.tsx
// Unified deal selection modal for both truck dashboard and customer ordering

import { useState, useEffect } from 'react'

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
}

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
  onApply,
  onClose,
  existingDeals = [],
}: {
  bundles: Bundle[]
  menuItems: MenuItem[]
  basketItems: BasketItem[]
  onApply: (deal: Bundle, slots: Record<string, string>, dealPrice: number, discountAmt: number) => void
  onClose: () => void
  existingDeals?: Array<{ bundle: Bundle; slots: Record<string, string> }>
}) {
  const [selectedDeal, setSelectedDeal] = useState<Bundle | null>(bundles.length === 1 ? bundles[0] : null)
  const [slotSelections, setSlotSelections] = useState<Record<string, string>>({})

  // Auto-prefill from basket when single deal is auto-selected
  useEffect(() => {
    if (bundles.length === 1 && selectedDeal) {
      const prefill: Record<string, string> = {}
      getBundleSlotCats(bundles[0]).forEach(cat => {
        const match = basketItems.find(b => {
          const item = menuItems.find(m => m.name === b.name)
          return item?.category.toLowerCase() === cat.toLowerCase()
        })
        if (match) prefill[cat] = `USE_EXISTING:${match.name}`
      })
      setSlotSelections(prefill)
    }
  }, [bundles, selectedDeal, basketItems, menuItems])

  const selectDeal = (bundle: Bundle) => {
    setSelectedDeal(bundle)
    // Pre-fill from basket
    const prefill: Record<string, string> = {}
    getBundleSlotCats(bundle).forEach(cat => {
      const match = basketItems.find(b => {
        const item = menuItems.find(m => m.name === b.name)
        return item?.category === cat
      })
      if (match) prefill[cat] = `USE_EXISTING:${match.name}`
    })
    setSlotSelections(prefill)
  }

  const applyDeal = () => {
    if (!selectedDeal) return
    const cats = getBundleSlotCats(selectedDeal)
    if (!cats.every(c => slotSelections[c])) return

    // Calculate original price from selected items (strip USE_EXISTING: prefix)
    const cleanSlots: Record<string, string> = {}
    cats.forEach(cat => {
      const raw = slotSelections[cat]
      cleanSlots[cat] = raw.startsWith('USE_EXISTING:') ? raw.replace('USE_EXISTING:', '') : raw
    })

    const originalPrice = Object.values(cleanSlots).reduce((sum, itemName) => {
      const item = menuItems.find(m => m.name === itemName)
      return sum + (item?.price || 0)
    }, 0)

    const discount = Math.max(0, originalPrice - selectedDeal.bundle_price)

    onApply(selectedDeal, cleanSlots, selectedDeal.bundle_price, discount)
  }

  // Calculate deal assignments to track which basket items are fully used
  const dealAssignments: Record<string, number> = {}
  existingDeals.forEach(d => 
    Object.values(d.slots).forEach(itemName => {
      if (itemName) dealAssignments[itemName] = (dealAssignments[itemName] || 0) + 1
    })
  )

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto">
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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center shrink-0">
            ×
          </button>
        </div>

        {!selectedDeal ? (
          // Deal list view
          <div className="space-y-3">
            {bundles.map(bundle => {
              const cats = getBundleSlotCats(bundle)
              const saving = bundle.original_price && bundle.original_price > 0
                ? bundle.original_price - bundle.bundle_price
                : null

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
                        <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">
                          Save £{saving.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cats.map(cat => {
                      const inBasket = basketItems.some(b => {
                        const item = menuItems.find(m => m.name === b.name)
                        return item?.category.toLowerCase() === cat.toLowerCase()
                      })
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
          // Slot picker view
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
              const inBasketOpts = basketItems.filter(b => 
                allOpts.some(m => m.name === b.name)
              )
              
              // Check which basket items are fully used in other deals
              const fullyUsed = new Set(
                inBasketOpts
                  .filter(b => (dealAssignments[b.name] || 0) >= b.quantity)
                  .map(b => b.name)
              )

              const isFilled = !!slotSelections[cat]
              const displayVal = slotSelections[cat]?.startsWith('USE_EXISTING:')
                ? slotSelections[cat].replace('USE_EXISTING:', '')
                : slotSelections[cat]

              return (
                <div key={cat} className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${isFilled ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {isFilled ? '✓' : ''}
                    </span>
                    <label className="text-xs font-black text-slate-700 uppercase">{cat}</label>
                    {inBasketOpts.length > 0 && (
                      <span className="text-[10px] text-green-600 font-bold">
                        ({inBasketOpts.length} in basket)
                      </span>
                    )}
                  </div>
                  <select
                    value={slotSelections[cat] || ''}
                    onChange={e => setSlotSelections(prev => ({ ...prev, [cat]: e.target.value }))}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 ${isFilled ? 'border-green-300' : 'border-slate-200'}`}>
                    <option value="">Choose {cat}…</option>
                    
                    {/* In-basket items first */}
                    {inBasketOpts.length > 0 && <option disabled>── In your basket (no extra added) ──</option>}
                    {inBasketOpts.map(b => (
                      <option key={`USE_EXISTING:${b.name}`} value={`USE_EXISTING:${b.name}`}
                        disabled={fullyUsed.has(b.name)}>
                        {b.name} (in basket){fullyUsed.has(b.name) ? ' — fully assigned to deals' : ''}
                      </option>
                    ))}
                    
                    {/* All menu items - adds new */}
                    {inBasketOpts.length > 0 && <option disabled>── Add new item ──</option>}
                    {allOpts.map(item => (
                      <option key={item.name} value={item.name}>
                        {item.name} £{item.price.toFixed(2)} — add new
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}

            {/* Show savings if all slots filled */}
            {getBundleSlotCats(selectedDeal).every(c => slotSelections[c]) && (() => {
              const cleanValues = Object.values(slotSelections).map(v => 
                v.startsWith('USE_EXISTING:') ? v.replace('USE_EXISTING:', '') : v
              )
              const orig = cleanValues.reduce((sum, itemName) => {
                const item = menuItems.find(i => i.name === itemName)
                return sum + (item?.price || 0)
              }, 0)
              const saving = Math.max(0, orig - selectedDeal.bundle_price)
              return saving > 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-center">
                  <p className="text-green-700 font-black text-sm">Save £{saving.toFixed(2)}</p>
                  <p className="text-green-600 text-xs">£{orig.toFixed(2)} → £{selectedDeal.bundle_price.toFixed(2)}</p>
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
                Apply deal · £{selectedDeal.bundle_price.toFixed(2)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}