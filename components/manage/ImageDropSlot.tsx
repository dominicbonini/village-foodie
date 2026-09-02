'use client'
// ── A TAP-OR-DROP IMAGE SLOT ──────────────────────────────────────────────────────────────────────────
// One control for every place the manage screen accepts a photo: the inline slot in the expanded menu
// list, the edit modal's slot, and the truck logo. Each mounted slot owns its OWN `useDragDrop`
// instance, which is why this is a component rather than a helper — hooks cannot be called inside the
// `.map()` that renders the item list, so the inline slot had to become a component before it could
// accept a drop at all.
//
// It is deliberately PRESENTATIONAL: it hands a File to `onFile` and knows nothing about uploading,
// optimistic state or the outbox. The caller owns all of that, so the drop path and the tap path are
// byte-identical after this line — the failure mode where one entry point quietly gains a fix the other
// misses cannot happen.
import type { ReactNode } from 'react'
import { useDragDrop } from '@/lib/useDragDrop'

/** Images only. The menu-import dropzone accepts PDFs too and is a different control
 *  (components/menu/MenuUploadFields.tsx) — a photo slot must never take a PDF. */
export const IMAGE_ACCEPT = ['image/*']

export function ImageDropSlot({
  onFile, children, className = '', title, disabled = false, draggingClassName = 'ring-2 ring-orange-400 ring-offset-1',
}: {
  onFile: (file: File) => void
  children: ReactNode
  className?: string
  title?: string
  disabled?: boolean
  /** Applied while a file is over the slot. Kept a prop so the logo slot and the 40px item thumbnail can
   *  each show it at a sensible weight without this component guessing. */
  draggingClassName?: string
}) {
  const { isDragging, dragProps } = useDragDrop(f => { if (!disabled) onFile(f) }, IMAGE_ACCEPT)
  return (
    <label
      {...dragProps}
      title={title}
      className={`${className} ${isDragging ? draggingClassName : ''} ${disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
    >
      {children}
      {/* The tap path. `sr-only` rather than hidden so the label→input relationship still opens the
          picker on a touch device — the drag handlers call preventDefault, and that must not cost the
          tap. */}
      <input
        type="file" accept="image/*" className="sr-only" disabled={disabled}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
      />
    </label>
  )
}
