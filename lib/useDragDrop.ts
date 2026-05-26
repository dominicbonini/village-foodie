import { useState, useRef, DragEvent } from 'react'

export function useDragDrop(onFileDrop: (file: File) => void, accept?: string[]) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    const file = files[0]

    if (accept && accept.length > 0) {
      const fileType = file.type
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase()
      const isAccepted = accept.some(a =>
        a.startsWith('.')
          ? fileExt === a.toLowerCase()
          : !!fileType.match(a.replace('*', '.*'))
      )
      if (!isAccepted) return
    }

    onFileDrop(file)
  }

  return {
    isDragging,
    dragProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  }
}
