'use client'
// On-screen ticket preview (Phase A validation). Renders the SAME TicketLine[] model the ESC/POS encoder
// consumes, so what you see here is what the printer will produce. No printer, no native code.
//
// ── 🔴 THIS IS THE ONLY WAY ANYONE CAN SEE THE TICKET BEFORE HARDWARE EXISTS ────────────────────────
// So a fidelity gap here is not a cosmetic bug: it means every review of the ticket — every layout
// decision taken from a screenshot — was made against something the printer will not produce. Four gaps
// were found on 6 August 2026 and all four are fixed below. Each is annotated with the encoder command it
// has to match. IF YOU CHANGE THIS FILE, CHECK IT AGAINST encodeEscPos LINE BY LINE.
//
//   1. DOUBLE WIDTH. `GS ! 0x11` is EXACTLY 2x the normal character cell, horizontally and vertically.
//      This rendered large text at 19px against an 11px base — 1.727x — plus `tracking-wide`, which has no
//      ESC/POS equivalent at all. A full-width double-width line therefore stopped ~10% short of the right
//      margin that normal-width lines reached, and `COLLECT 18:45` looked un-aligned when on paper it is
//      flush by construction. Now 22px exactly, no tracking.
//   2. BOLD. The encoder emits `ESC E` per line, from `line.bold`. This applied `font-black` to EVERY large
//      line regardless — so a non-bold large line (the stacked collect time) previewed bold and prints
//      normal. Now driven by `line.bold` at both sizes.
//   3. INVERT WIDTH. `GS B` inverts the character cells actually printed — the black is ragged-right. A
//      block-level `bg-black` filled the whole container instead, overstating every emphasised block as a
//      solid full-width bar. Now an inline span, so the black hugs the glyphs exactly as it will on paper.
//   4. CHARACTERS. The printer cannot render anything outside printable ASCII except '£'. "José" previewed
//      perfectly and prints "Jos?". Now passed through printableText() — THE SAME FUNCTION strBytes() is
//      built on, so the preview cannot drift from the byte stream.
//
// ⚠️ STILL NOT FAITHFUL, and not fixable in a browser: thermal contrast, actual print density, paper
// feed/line pitch, and how inverted text physically looks coming off a print head. Nothing here has been
// seen on paper.
import { buildTicketLines, printableText, type TicketOrder, type TicketConfig, type TicketType } from '@/lib/printing/ticket'

export function TicketPreview({ order, config, type = 'combined' }: {
  order: TicketOrder
  config: TicketConfig
  type?: TicketType
}) {
  const lines = buildTicketLines(order, config, type)
  const cols = config.paper_width === 58 ? 32 : 48

  // 🔴 THE PAPER IS EXACTLY `cols` CHARACTERS WIDE — expressed in `ch`, which for a monospace font is the
  // character advance. So a normal line of `cols` chars fills it precisely, and a large line of `cols / 2`
  // chars at exactly 2x fills the same span. That is what makes the right margins agree.
  // Padding sits on an OUTER element so it cannot eat into the character width.
  const BASE_PX = 11

  return (
    <div className="inline-block bg-white text-black shadow-md border border-slate-300 rounded-sm">
      <div className="px-3 py-3">
        <div className="font-mono leading-[1.35]" style={{ fontSize: `${BASE_PX}px`, width: `${cols}ch` }}>
          {lines.map((l, i) => {
            // Dividers print as a full-width rule of '-' in ordinary black.
            if (l.divider) return <div key={i} className="whitespace-pre">{'-'.repeat(cols)}</div>

            const text = printableText(l.text ?? '')          // gap 4 — what will REALLY print
            const isLarge = l.size === 'large'
            return (
              <div
                key={i}
                className={`${l.align === 'center' ? 'text-center' : 'text-left'} whitespace-pre`}
                // gap 1 — 2x EXACTLY (22px against an 11px base), and no letter-spacing.
                style={isLarge ? { fontSize: `${BASE_PX * 2}px`, lineHeight: 1.35 } : undefined}
              >
                {/* gap 3 — inline span, so `invert` blacks only the printed cells (ragged right), and
                    gap 2 — bold comes from `line.bold` at BOTH sizes, exactly as ESC E does. */}
                <span className={`${l.bold ? 'font-bold' : ''} ${l.invert ? 'bg-black text-white' : ''}`}>
                  {text || ' '}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
