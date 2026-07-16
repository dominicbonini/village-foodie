'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Toggle } from '@/components/dashboard/OrderCard'
import { isNativeApp } from '@/lib/native/device'
import { operatorSignOut } from '@/lib/native/signOut'
import { ThisDeviceSettings } from '@/components/native/OperatorDeviceConfig'
import { VanMenuChooser } from '@/components/native/VanMenuChooser'

interface UserMenuProps {
  // Account/session control — the identity block shows the LOGGED-IN USER (name + email), NOT the
  // viewed truck (the truck is identified by the central AppHeader). truckName is no longer used by
  // the identity block; kept optional for back-compat with callers that still pass it.
  truckName?: string | null
  operatorName: string | null
  userEmail?: string | null
  token: string
  // Context flags — control which items appear
  showScreenToggle?: boolean    // dashboard only
  showOrderUtilities?: boolean  // dashboard only (Order link, QR, Kitchen)
  showManageLink?: boolean      // dashboard only
  showDashboardLink?: boolean   // manage page only
  isAdmin?: boolean
  // Screen toggle — BINARY: `keepScreenOn` carries the ACTUAL held-state (green on / grey off). Failure copy
  // is a toast raised by the parent's onToggleScreenOn, not a label here.
  keepScreenOn?: boolean
  onToggleScreenOn?: () => void
  // Sound toggle — SAME per-device pref/state as the header (hidden sm:flex there), so a phone operator
  // can still turn sound on/off. Enabling primes the audio (the parent's handler does primeAudio()).
  soundEnabled?: boolean
  onToggleSound?: () => void
  // Order utilities
  copiedOrderLink?: boolean
  onCopyOrderLink?: () => void
  onShowQR?: () => void
  onOpenKDS?: () => void
}

export default function UserMenu({
  truckName,
  operatorName,
  userEmail,
  token,
  showScreenToggle,
  showOrderUtilities,
  showManageLink,
  showDashboardLink,
  isAdmin,
  keepScreenOn = false,
  onToggleScreenOn,
  soundEnabled = true,
  onToggleSound,
  copiedOrderLink,
  onCopyOrderLink,
  onShowQR,
  onOpenKDS,
}: UserMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deviceOpen, setDeviceOpen] = useState(false)   // "This device" sheet (native-only)
  // Identity = the LOGGED-IN USER: prefer their name, fall back to their email. Avatar initial
  // follows whichever we show.
  const displayName = (operatorName && operatorName.trim()) || null
  const identityLabel = displayName || userEmail || null
  const initial = (identityLabel || '?').charAt(0).toUpperCase()

  const handleSignOut = async () => {
    // Clears the SESSION only — never touches van_devices, so the device stays pinned to its truck/van/
    // screen and the next person lands on the same device config (person-switch, not device reconfigure).
    // Native-aware: app clears the native session + soft-routes in-app; web unchanged (cookie + hard nav).
    await operatorSignOut(router)
  }

  const hasMiddleSection = showScreenToggle || showOrderUtilities

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-xl px-2 py-1 hover:bg-white/10 transition-colors"
        aria-label="User menu"
      >
        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-semibold text-orange-700">
          {initial}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-lg border border-slate-100 z-50 overflow-hidden">

            {/* Identity block — the LOGGED-IN USER (not the viewed truck). Line 1 = their name
                (or email if no name), line 2 = their email (omitted when it would duplicate line 1). */}
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-800 truncate">{identityLabel || '—'}</p>
              {displayName && userEmail && (
                <p className="text-xs text-slate-400 truncate mt-0.5">{userEmail}</p>
              )}
            </div>

            {/* Screen on — dashboard only, mobile only */}
            {/* Screen on — dashboard only, mobile only. BINARY: green "Screen on" when held, grey "Screen off"
                otherwise. `keepScreenOn` here IS the held-state (parent passes screenHeld). Failure → toast. */}
            {showScreenToggle && (
              <div className="sm:hidden px-4 py-2 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">{keepScreenOn ? 'Screen on' : 'Screen off'}</span>
                  <Toggle on={keepScreenOn} onToggle={() => onToggleScreenOn?.()} />
                </div>
              </div>
            )}

            {/* Sound — dashboard only, mobile only (the header toggle is hidden sm:flex). SAME per-device
                pref as the header; parent's onToggleSound primes audio on enable. Placed right after Screen,
                per the canonical dropdown order (identity → Screen → Sound → utilities → …). */}
            {showScreenToggle && onToggleSound && (
              <div className="sm:hidden px-4 py-2 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">{soundEnabled ? '🔔 Sound on' : '🔕 Sound off'}</span>
                  <Toggle on={soundEnabled} onToggle={() => onToggleSound()} />
                </div>
              </div>
            )}

            {/* Utility actions — dashboard only, mobile only */}
            {showOrderUtilities && (
              <div className="sm:hidden border-b border-slate-100">
                <button
                  onClick={() => { onCopyOrderLink?.(); setOpen(false) }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 w-full hover:bg-slate-50 text-left"
                >
                  <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                  {copiedOrderLink ? '✓ Copied' : 'Order link'}
                </button>
                <button
                  onClick={() => { onShowQR?.(); setOpen(false) }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 w-full hover:bg-slate-50 text-left"
                >
                  <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
                  </svg>
                  QR code
                </button>
                <button
                  onClick={() => { onOpenKDS?.(); setOpen(false) }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 w-full hover:bg-slate-50 text-left"
                >
                  <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                  Kitchen screen
                </button>
              </div>
            )}

            {/* Divider after middle section — only if it rendered anything */}
            {hasMiddleSection && <div className="sm:hidden" />}

            {/* Van chooser (native only) — always shows the CURRENT van; switchable when the truck has >1
                van (any truck member may switch — permission note lives in VanMenuChooser). Self-guards on
                isNativeApp + renders null until the van state loads. */}
            <VanMenuChooser token={token} />

            {/* This device (native app only) — per-device/user config, NOT role-gated and NOT sm:hidden so
                a staff member who can't reach Manage can still configure their own device on the iPad. */}
            {isNativeApp() && (
              <button
                onClick={() => { setDeviceOpen(true); setOpen(false) }}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 w-full text-left"
              >
                📱 This device
              </button>
            )}

            {/* Manage link */}
            {showManageLink && (
              <Link
                href={`/manage/${token}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                ⚙️ Manage
              </Link>
            )}

            {/* Orders dashboard link — mobile only (desktop header already has it) */}
            {showDashboardLink && (
              <a
                href={`/dashboard/${token}`}
                className="sm:hidden flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 w-full"
              >
                ← Orders dashboard
              </a>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                🔐 Admin
              </Link>
            )}

            <hr className="border-slate-100" />

            {/* Sign out — always */}
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </div>
        </>
      )}

      {/* "This device" sheet — ThisDeviceSettings (default screen · van · notifications). Native-only
          (ThisDeviceSettings self-guards on isNativeApp and renders its own card + "this device only" note).
          Rendered only on tap → no SSR/hydration concern. */}
      {deviceOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setDeviceOpen(false)}>
          <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-1">
              <button onClick={() => setDeviceOpen(false)} aria-label="Close"
                className="text-white/80 hover:text-white text-3xl leading-none">×</button>
            </div>
            <div className="bg-white rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
              <ThisDeviceSettings token={token} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
