'use client'

import { useState } from 'react'

interface TooltipProps {
  content: string
  children?: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  return (
    <span className="relative inline-flex items-center">
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onTouchStart={() => setVisible(v => !v)}
        className="inline-flex"
      >
        {children ?? (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full
                           bg-slate-200 text-slate-500 text-xs font-semibold
                           cursor-help select-none hover:bg-slate-300 transition-colors">
            ?
          </span>
        )}
      </span>
      {visible && (
        <span className={`absolute z-50 ${positionClasses[position]}`}>
          <span className="block w-56 bg-slate-900 text-white text-xs rounded-lg
                           px-3 py-2 leading-relaxed shadow-lg">
            {content}
          </span>
        </span>
      )}
    </span>
  )
}
