'use client'
// components/dashboard/DealsModal.tsx

import { useState, useEffect } from 'react'
import type { Bundle, MenuItem, BasketItem } from './types'
import { getBundleSlotCats } from './helpers'
import { prefillSlotsFromBasket, calculateDealOriginalPrice } from '@/lib/deal-utils'


export function DealsModal({ bundles, menuItems, basketItems, onApply, onClose }: {
  bundles: any[]
  menuItems: MenuItem[]
  basketItems: BasketItem[]
  onApply: (deal: any, slots: Record<string,string>, dealPrice: number, discountAmt: number) => void
  onClose: () => void
}) {
  const [selectedDeal, setSelectedDeal] = useState<any>(bundles.length === 1 ? bundles[0] : null)
  const [slotSelections, setSlotSelections] = useState<Record<string,string>>({})

  // Auto-prefill slots when single deal is auto-selected
  useEffect(() => {
    if (bundles.length === 1) {
      const bundle = bundles[0]
      const prefill = prefillSlotsFromBasket(bundle, basketItems, menuItems)
      setSlotSelections(prefill)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectDeal = (bundle: any) => {
    setSelectedDeal(bundle)
    // Pre-fill slots from basket using shared utility
    const prefill = prefillSlotsFromBasket(bundle, basketItems, menuItems)
    setSlotSelections(prefill)
  }

  if (!selectedDeal) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
        onClick={e => e.target===e.currentTarget && onClose()}>
        <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-black text-slate-900">Choose a deal</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
          </div>
          <p className="text-xs text-slate-400 mb-4">All deals available regardless of time — time windows shown for info only.</p>
          <div className="space-y-3">
            {bundles.map((bundle: any) => {
              // Calculate original price from slots if not set
              const slots = ['slot_1_category','slot_2_category','slot_3_category','slot_4_category','slot_5_category','slot_6_category']
              const slotCats = slots.map(k => bundle[k]).filter(Boolean)
              const calcOriginal = slotCats.reduce((total: number, cat: string) => {
                const cheapest = menuItems.filter(m => m.category === cat).sort((a,b) => a.price-b.price)[0]
                return total + (cheapest?.price || 0)
              }, 0)
              const originalPrice = bundle.original_price || calcOriginal
              const saving = originalPrice > bundle.bundle_price ? originalPrice - bundle.bundle_price : 0

              return (
                <button key={bundle.name} onClick={() => selectDeal(bundle)}
                  className="w-full text-left border border-slate-200 rounded-xl p-3 bg-slate-50 hover:border-orange-300 hover:bg-orange-50 transition-all">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-black text-slate-900 text-sm">{bundle.name}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{bundle.description}</p>
                      <p className="text-xs text-slate-400 mt-1">{slotCats.map((c:string) => c.charAt(0).toUpperCase()+c.slice(1)).join(' + ')}</p>
                      {(bundle.start_time || bundle.end_time) && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {[bundle.start_time&&`from ${bundle.start_time}`, bundle.end_time&&`until ${bundle.end_time}`].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-black text-orange-600">£{bundle.bundle_price.toFixed(2)}</p>
                      {saving > 0 && (
                        <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">Save £{saving.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Selected deal — choose items for each slot
  const slots = ['slot_1_category','slot_2_category','slot_3_category','slot_4_category','slot_5_category','slot_6_category']
  const activeSlots = slots.map((k,i) => ({ key:`slot_${i+1}`, cat: selectedDeal[k] })).filter(s => s.cat)
  const allFilled = activeSlots.every(s => slotSelections[s.key])

  // Calc saving
  const originalFromSlots = activeSlots.reduce((t, s) => {
    const sel = slotSelections[s.key]
    const item = menuItems.find(m => m.name === sel)
    return t + (item?.price || 0)
  }, 0)
  const saving = originalFromSlots > selectedDeal.bundle_price ? originalFromSlots - selectedDeal.bundle_price : 0

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setSelectedDeal(null)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">←</button>
          <h3 className="font-black text-slate-900 flex-1">{selectedDeal.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="space-y-3 mb-4">
          {activeSlots.map(({ key, cat }) => {
            const itemsForCat = menuItems.filter(m => m.category === cat)
            const selected = slotSelections[key]
            return (
              <div key={key}>
                <label className="block text-xs font-black text-orange-600 uppercase tracking-wide mb-1">
                  {cat.charAt(0).toUpperCase()+cat.slice(1)}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {itemsForCat.map(item => (
                    <button key={item.name}
                      onClick={() => setSlotSelections(prev => ({...prev, [key]: item.name}))}
                      className={`px-3 py-1.5 rounded-xl border text-sm font-bold transition-all ${selected===item.name ? 'bg-orange-600 text-white border-orange-600' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300'}`}>
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Price summary */}
        <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1">
          {activeSlots.map(({ key, cat }) => {
            const item = menuItems.find(m => m.name === slotSelections[key])
            return slotSelections[key] ? (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-slate-600">{slotSelections[key]}</span>
                <span className="text-slate-400 line-through text-xs self-center">£{item?.price.toFixed(2)}</span>
              </div>
            ) : null
          })}
          {saving > 0 && (
            <div className="flex justify-between text-sm text-green-600 font-bold pt-1 border-t border-slate-200">
              <span>Saving</span><span>-£{saving.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-black pt-1 border-t border-slate-200">
            <span className="text-slate-900">Deal price</span>
            <span className="text-orange-600">£{selectedDeal.bundle_price.toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={() => {
            if (!allFilled) return
            onApply(selectedDeal, slotSelections, selectedDeal.bundle_price, saving)
          }}
          disabled={!allFilled}
          className="w-full bg-orange-600 text-white font-black py-3 rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-40"
        >
          {allFilled ? `Apply deal · £${selectedDeal.bundle_price.toFixed(2)}` : 'Select all items to continue'}
        </button>
      </div>
    </div>
  )
}