'use client'

// components/admin/InlineField.tsx
//
// 🔴 MOVED, NOT REWRITTEN. This is the outreach table's InlineField, lifted verbatim into its own
// module so the discovery-events table can use THE SAME component rather than a second copy of it.
// App manual §51.7 records a "reuse" that was really a fourth independent implementation; a second
// borderless-input-with-a-dirty-guard would be that again. The function body below is byte-identical
// to the one that was in OutreachPanel.tsx — proven, not asserted, in the report.
//
// ⚠️ ONE WRITER PER COLUMN IS PRESERVED: this component never chooses a write path. It calls the
// `onCommit` its caller supplies, so each table keeps its own single writer.

import { useEffect, useRef, useState } from 'react'

// ── AN INLINE, BORDERLESS TABLE FIELD ────────────────────────────────────────────────────────────────
// Used for Phone and Email. Capturing contact details IS the job of this page, so there is deliberately
// NO click-to-edit step — the box is a real <input> at all times and you can type into it straight away.
//
// 🔴 IT LOOKS LIKE TEXT UNTIL YOU TOUCH IT. 🧪 172 of 231 emails and 161 of 231 phones are empty, so 462
// always-bordered boxes would read as a form and bury the rows that actually hold data. At rest the input
// is transparent with a transparent border; the border and white background appear on hover and focus.
// ⚠️ `border-transparent`, NOT `border-0`: the border is always THERE and only changes colour, so nothing
// shifts by a pixel when it appears. Swapping border-0 for a border on hover would jiggle every row.
//
// 🔴 WRITES ONLY ON A REAL CHANGE. `seeded` records the value the box was last given by the server; blur
// compares against THAT and sends nothing when they match. Tabbing across a row therefore fires zero
// writes — which matters because these two columns live on `discovery_trucks`, a table 🧪 confirmed
// anon-readable, and a no-op write is indistinguishable from a real one once it has left the browser.
function InlineField({ value, onCommit, onHold, placeholder, type, title }: {
  value: string | null
  onCommit: (next: string) => void
  onHold: (hold: boolean) => void
  placeholder: string
  type: 'text' | 'email'
  title?: string
}) {
  const [draft, setDraft] = useState(value ?? '')
  const seeded = useRef(value ?? '')
  const focused = useRef(false)

  // Re-seed when the SERVER value changes (an edit made in the modal, or a reload) — but never while the
  // box has focus, or an incoming update would overwrite what is being typed.
  useEffect(() => {
    if (focused.current) return
    setDraft(value ?? '')
    seeded.current = value ?? ''
  }, [value])

  const commit = () => {
    const next = draft.trim()
    // 🔴 THE GUARD. Identical to what it was seeded with -> no call at all.
    if (next === (seeded.current ?? '').trim()) return
    seeded.current = next
    onCommit(next)
  }

  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      title={title ?? (draft || placeholder)}
      // ⚠️ Belt and braces only: 🔎 the <tr> carries NO onClick and the only handler in the row is on the
      // truck-name <button> in a DIFFERENT cell, so a click here has no ancestor handler to reach. This
      // stops a future row-level click from silently capturing these too.
      onClick={e => e.stopPropagation()}
      onFocus={() => { focused.current = true; onHold(true) }}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { focused.current = false; commit(); onHold(false) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
        // Escape abandons the edit and restores the last server value — nothing is written.
        if (e.key === 'Escape') { setDraft(seeded.current ?? ''); (e.target as HTMLInputElement).blur() }
      }}
      className="w-full text-sm text-slate-600 text-center bg-transparent border border-transparent rounded px-1 py-0.5 truncate
                 placeholder:text-slate-300
                 hover:border-slate-200 hover:bg-white
                 focus:border-orange-400 focus:bg-white focus:outline-none focus:text-left"
    />
  )
}
export default InlineField
