'use client'

// components/menu/MenuUploadFields.tsx
// THE menu-upload input pair — drag/drop-or-tap file picker + "or paste as text".
//
// EXTRACTED from the Manage import wizard's first step (app/manage/[token]/page.tsx, `importStep ===
// 'upload'`) so the public demo modal and the operator importer are literally the same control. Two
// dropzones WOULD drift — different accept lists, different drag affordances, one of them quietly missing
// a fix the other got.
//
// SCOPE — fields only, deliberately:
//   • no modal chrome    — the two surfaces sit in different shells
//   • no submit/cancel   — Manage uses its local <Btn>; the demo has its own footer
//   • no wizard state    — this step never read any (no importResult / reviewStep / categoryPrep), which
//                          is why the extraction is safe rather than a refactor of the wizard
// It owns the useDragDrop instance, because the drag behaviour IS the thing being shared.

import { useDragDrop } from '@/lib/useDragDrop'

/** Accept list — one definition, both surfaces. Kept identical to the Manage original. */
export const MENU_UPLOAD_ACCEPT = ['image/*', '.pdf']

/** Accent palette. 'app' = the dashboard/Manage orange (default — Manage must not change). 'landing' =
 *  the landing page's warmer amber (--orange / --orange-line / --orange-wash), used by the public demo
 *  modal so its dropzone matches the CTA that opened it. Class strings are literal on both branches so
 *  Tailwind's JIT keeps them; the landing branch reads the tokens shared onto `.hg-demo-modal`. */
const ACCENT = {
  app: {
    dragging: 'border-orange-400 bg-orange-50',
    idle: 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30',
    ring: 'focus:ring-orange-400',
  },
  landing: {
    dragging: 'border-[var(--orange)] bg-[var(--orange-wash)]',
    idle: 'border-slate-200 hover:border-[var(--orange-line)] hover:bg-[var(--orange-wash)]/40',
    ring: 'focus:ring-[var(--orange)]',
  },
} as const

export function MenuUploadFields({
  file, onFile, text, onText, disabled = false, accent = 'app',
}: {
  file: File | null
  onFile: (f: File | null) => void
  text: string
  onText: (t: string) => void
  disabled?: boolean
  accent?: keyof typeof ACCENT
}) {
  const a = ACCENT[accent]
  const { isDragging, dragProps } = useDragDrop(f => onFile(f), MENU_UPLOAD_ACCEPT)

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">Upload menu file</label>
        <label
          {...dragProps}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${isDragging ? a.dragging : a.idle}`}
        >
          <span className="text-3xl">{isDragging ? '📂' : file ? '✅' : '📷'}</span>
          <span className="text-sm text-slate-700 text-center break-all">
            {isDragging ? 'Drop your menu here' : file ? file.name : 'Drag and drop or tap to choose'}
          </span>
          {!isDragging && !file && (
            <span className="text-xs text-slate-500">Image or PDF</span>
          )}
          <input
            type="file" accept="image/*,.pdf" className="sr-only" disabled={disabled}
            onChange={e => onFile(e.target.files?.[0] || null)}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400 font-medium">or</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1">Paste menu text</label>
        <textarea
          value={text}
          onChange={e => onText(e.target.value)}
          disabled={disabled}
          placeholder="Paste your menu here — item names, descriptions, prices..."
          rows={5}
          className={`w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 ${a.ring}`}
        />
      </div>
    </div>
  )
}
