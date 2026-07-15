// ⚠️ APPROXIMATION — a TYPE + SVG stand-in for the HatchGrab wordmark (Archivo italic "HATCH" + a
// lightning bolt, then "Grab" under a sweeping arrow). SWAP FOR THE REAL VECTOR ASSET when it's produced.
//
// This component emits only the markup + class hooks; the visual styling lives in the SCOPED landing
// stylesheet (`app/landing/landing.css`, under `.hg-landing .logo …`). `variant="dark"` renders "HATCH"
// in white for dark backgrounds (the nav + footer bars).
import React from 'react'

export function HatchGrabWordmark({
  variant = 'light',
  className = '',
}: {
  variant?: 'light' | 'dark'
  className?: string
}) {
  return (
    <span
      className={`logo${variant === 'dark' ? ' logo-dark' : ''}${className ? ` ${className}` : ''}`}
      aria-label="HatchGrab"
    >
      <span className="a">HATCH</span>
      <svg className="bolt" viewBox="0 0 14 32" aria-hidden="true">
        <path d="M11 0 L2 18 H6.5 L4 32 L13 13 H8.5 Z" />
      </svg>
      <span className="gwrap">
        <svg className="swoosh" viewBox="0 0 104 32" aria-hidden="true">
          <path d="M1 26 C24 24, 54 18, 76 8 L76 2 L101 13 L76 24 L76 18 C54 24, 24 29, 1 30 Z" />
        </svg>
        <span className="b">Grab</span>
      </span>
    </span>
  )
}
