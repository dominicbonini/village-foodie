'use client';

// components/manage/ReorderDrag.tsx — 🔴 THE ONE DRAG-TO-REORDER MECHANISM OF MANAGE › MENU (deals-order-1, 13 November 2026).
// It was written inline on the category list (Menu › Items) and is MOVED here, byte for byte, so the formules list (Menu › Deals)
// uses the very same thing — the same six-dot handle, the same native HTML5 drag (mouse; and a long press on touch where the
// browser supports dragging, e.g. Safari on iPad/iPhone, Chrome on Android), the same dashed-orange lifted row and orange drop
// line, the same "drop on a row → that row's place" rule. Only WHAT IS SAVED differs, and the caller passes that in.
//   • `reorderRowProps(list, index, onReorder)` — spread onto each row's outer element. On a drop it builds the new order and
//     calls `onReorder(newList)`; the caller writes each row's sort_order (1, 2, 3, …), reloads and says so.
//   • `<DragHandle title=… />` — the "⋮⋮" grip, exactly the category list's markup.
import type { DragEvent } from 'react'

export function reorderRowProps<T extends { id: string }>(list: readonly T[], index: number, onReorder: (next: T[]) => void | Promise<void>) {
  const row = list[index]
  return {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/html', row.id)
      const target = e.currentTarget as HTMLElement
      target.style.opacity = '0.5'
      target.style.border = '2px dashed #fb923c'
    },
    onDragEnd: (e: DragEvent<HTMLDivElement>) => {
      const target = e.currentTarget as HTMLElement
      target.style.opacity = '1'
      target.style.border = ''
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const target = e.currentTarget as HTMLElement
      target.style.borderTop = '3px solid #fb923c'
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      const target = e.currentTarget as HTMLElement
      target.style.borderTop = ''
    },
    onDrop: async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const target = e.currentTarget as HTMLElement
      target.style.borderTop = ''

      const draggedId = e.dataTransfer.getData('text/html')
      if (draggedId === row.id) return

      const draggedIndex = list.findIndex(c => c.id === draggedId)
      if (draggedIndex < 0) return   // a drag from somewhere else (another list, a file): not ours
      const targetIndex = index

      // Reorder the array
      const next = [...list]
      const [removed] = next.splice(draggedIndex, 1)
      next.splice(targetIndex, 0, removed)
      await onReorder(next)
    },
  }
}

/** The "⋮⋮" grip — the category list's markup, unchanged. `draggable={false}`: the ROW is what is dragged. */
export function DragHandle({ title }: { title: string }) {
  return (
    <div className="text-slate-600 hover:text-slate-900 cursor-grab active:cursor-grabbing text-xl font-bold select-none" title={title} draggable={false}>
      ⋮⋮
    </div>
  )
}
