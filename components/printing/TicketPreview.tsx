'use client'
// On-screen ticket preview (Phase A validation). Renders the SAME TicketLine[] model the ESC/POS encoder
// consumes, in a monospace, correct-width "receipt" — so what you see here is what the printer will produce
// (layout, wrapping, big header, dividers). No printer, no native code. This is how Phase A is validated.
import { buildTicketLines, type TicketOrder, type TicketConfig, type TicketType } from '@/lib/printing/ticket'

export function TicketPreview({ order, config, type = 'combined' }: {
  order: TicketOrder
  config: TicketConfig
  type?: TicketType
}) {
  const lines = buildTicketLines(order, config, type)
  const cols = config.paper_width === 58 ? 32 : 48
  // Approximate the physical roll width visually (58mm ≈ narrower). Monospace at ~0.6ch each.
  const widthRem = config.paper_width === 58 ? 15.5 : 23

  return (
    <div className="inline-block bg-white text-black shadow-md border border-slate-300 rounded-sm">
      <div className="font-mono text-[11px] leading-[1.35] px-3 py-3" style={{ width: `${widthRem}rem` }}>
        {lines.map((l, i) => {
          if (l.divider) return <div key={i} className="whitespace-pre overflow-hidden text-slate-500">{'-'.repeat(cols)}</div>
          const align = l.align === 'center' ? 'text-center' : 'text-left'
          const weight = l.bold ? 'font-bold' : ''
          const size = l.size === 'large' ? 'text-[19px] font-black tracking-wide' : ''
          return (
            <div key={i} className={`${align} ${weight} ${size} whitespace-pre-wrap break-words`}>
              {l.text || ' '}
            </div>
          )
        })}
      </div>
    </div>
  )
}
