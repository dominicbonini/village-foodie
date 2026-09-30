// components/admin/outreach-icons.tsx — the six history icons, and the row label that uses them.
//
// 🔴 ONE SIZE, ONE STROKE, ONE COLOUR, AND NO EMOJI. The history used `↗ ↙ ☎ ✎ ·` — unicode
// characters that render at whatever size and weight the font feels like, differ between macOS and
// Windows, and in two cases mean nothing until somebody explains them. These are outline SVGs in the
// style this app already uses everywhere else (`fill="none" stroke="currentColor" viewBox="0 0 24
// 24"`, 2px round joins), at 14px, in the same grey as the date beside them.
//
// ⚠️ THE PATHS ARE THE ONLY THING IN THIS FILE. Which icon a row gets is decided by `rowLabel` in
// `lib/outreach-timeline.ts`, which is pure and harness-tested; this module cannot choose, and a row
// cannot reach past it to draw its own.
'use client'

import type { RowIconName, RowLabel } from '@/lib/outreach-timeline'

/** ⚠️ EVERY ICON THIS APP DRAWS IN THE HISTORY, which is the five ROW icons plus the chevron. A row
 *  can only ever be labelled with a `RowIconName`; `chevron` is not one and cannot become one. */
export type IconName = RowIconName | 'chevron'

const PATHS: Record<IconName, string> = {
  // An envelope.
  envelope: 'M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  // A handset.
  phone: 'M3 5a2 2 0 012-2h2.2a1 1 0 01.98.8l.7 3.2a1 1 0 01-.55 1.1L7 9a11 11 0 005 5l.9-1.3a1 1 0 011.1-.55l3.2.7a1 1 0 01.8.98V19a2 2 0 01-2 2A16 16 0 013 5z',
  // A speech bubble.
  chat: 'M8 12h8M8 8h8M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z',
  // A pencil.
  pencil: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  // Two arrows, for a stage moving from one word to another.
  arrows: 'M4 7h13m0 0l-3-3m3 3l-3 3M20 17H7m0 0l3-3m-3 3l3 3',
  // 🔴 A CHEVRON, FOR "there is more of this". It is not a row icon — no row is ever labelled with
  // it — but it belongs in this file so there is still exactly one place icons are drawn.
  chevron: 'M9 6l6 6-6 6',
}

/** One icon, at the one size. ⚠️ `aria-hidden`: the WORD beside it is what a reader needs. */
export function RowIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`shrink-0 ${className}`}>
      <path d={PATHS[name]} />
    </svg>
  )
}

/**
 * The icon and the word, in a fixed-width column so every row lines up.
 *
 * 🔴 THE WIDTH IS FIXED HERE AND NOWHERE ELSE. Rows that size their own label column are rows that
 * do not line up, which is the whole complaint this answers.
 * ⚠️ "Received" IS A PILL, and the only one — a reply is the row you are looking for. It is bold
 * dark text on a light grey pill, NOT a colour: the green row background it replaces said the same
 * thing in a way that a greyscale print, a colour-blind reader and a phone in sunlight all lose.
 */
export function RowLabelCell({ label, className = '' }: { label: RowLabel; className?: string }) {
  return (
    <span className={`w-[5.5rem] shrink-0 flex items-center gap-1.5 ${className}`}>
      <RowIcon name={label.icon} className="text-slate-400" />
      {label.pill ? (
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-900 bg-slate-100 border border-slate-200 rounded px-1 py-px">
          {label.word}
        </span>
      ) : (
        <span className="text-[11px] text-slate-500">{label.word}</span>
      )}
    </span>
  )
}
