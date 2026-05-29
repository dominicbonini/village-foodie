'use client'
// Shared order line item display — used by AddOrderPanel (operator) and customer basket summary.
// variant="operator": total price right-aligned, modifier lines in orange below name, no base price.
// variant="customer": base price on first row (when modifiers exist), modifier sub-rows, total footer row.
// Matches the canonical email format in lib/email.ts.

import React from 'react'

interface Mod { name: string; price: number }

interface Props {
  name: string
  quantity: number
  /** Combined unit price (base + modifiers). Always required. */
  unitPrice: number
  /** Base unit price without modifiers. Required for variant="customer" breakdown. */
  basePrice?: number
  modifiers?: Mod[]
  specialInstructions?: string
  variant?: 'operator' | 'customer'
  /** Slot for the Edit/Customise button, rendered beside the name (operator only). */
  nameSuffix?: React.ReactNode
  /** Slot for the price display — defaults to a plain price span. Pass <InlinePriceEditor> for operator. */
  rightSlot?: React.ReactNode
}

export function OrderLineItem({
  name,
  quantity,
  unitPrice,
  basePrice,
  modifiers = [],
  specialInstructions,
  variant = 'operator',
  nameSuffix,
  rightSlot,
}: Props) {
  const hasMods = modifiers.length > 0
  const modSum = modifiers.reduce((s, m) => s + m.price, 0)
  const lineTotal = unitPrice * quantity
  // Customer view shows base × qty on first row when modifiers add to the price
  const showBreakdown = variant === 'customer' && hasMods && basePrice !== undefined && modSum > 0
  const firstRowPrice = showBreakdown ? basePrice! * quantity : lineTotal

  return (
    <div>
      {/* Name row */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          <span className={variant === 'operator' ? 'text-sm font-bold text-slate-900' : 'text-xs text-slate-600'}>
            {variant === 'customer' && quantity > 1 ? `${quantity}× ` : ''}{name}
          </span>
          {nameSuffix}
        </div>
        {rightSlot ?? (
          <span className={variant === 'operator' ? 'text-sm font-bold text-slate-900 shrink-0' : 'text-xs font-medium text-slate-700 shrink-0'}>
            £{firstRowPrice.toFixed(2)}
          </span>
        )}
      </div>

      {/* Modifier rows */}
      {modifiers.map(m => (
        <div
          key={m.name}
          className={variant === 'operator'
            ? 'flex items-center gap-1 text-sm text-orange-500 font-medium mt-0.5'
            : 'flex justify-between text-[10px] pl-3 text-slate-400'}
        >
          <span>{variant === 'operator'
            ? `${m.name}${m.price > 0 ? ` +£${m.price.toFixed(2)}` : ''}`
            : `+ ${m.name}`}
          </span>
          {variant === 'customer' && m.price > 0 && (
            <span>+£{(m.price * quantity).toFixed(2)}</span>
          )}
        </div>
      ))}

      {/* Total footer row (customer with modifier breakdown only) */}
      {showBreakdown && (
        <div className="flex justify-between text-[10px] pl-3 text-slate-600 font-medium border-t border-slate-200 mt-0.5 pt-0.5">
          <span>Total</span>
          <span>£{lineTotal.toFixed(2)}</span>
        </div>
      )}

      {/* Note */}
      {specialInstructions && (
        <div className={variant === 'operator'
          ? 'text-[10px] text-slate-400 italic mt-0.5'
          : 'text-[10px] pl-3 text-slate-400 italic'}>
          📝 {specialInstructions}
        </div>
      )}
    </div>
  )
}
