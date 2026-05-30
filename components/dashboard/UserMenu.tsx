'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Toggle } from '@/components/dashboard/OrderCard'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

interface UserMenuProps {
  currentUserName: string | null
  truckName: string | null
  token: string
  userRole: 'owner' | 'manager' | 'staff' | null
  vanName?: string
  onSignOut: () => void
  // Mobile-only extras (passed from dashboard, rendered sm:hidden inside dropdown)
  keepScreenOn: boolean
  onToggleScreenOn: () => void
  copiedOrderLink: boolean
  onCopyOrderLink: () => void
  onShowQR: () => void
  onOpenKDS: () => void
}

export default function UserMenu({
  currentUserName,
  truckName,
  token,
  userRole,
  onSignOut,
  keepScreenOn,
  onToggleScreenOn,
  copiedOrderLink,
  onCopyOrderLink,
  onShowQR,
  onOpenKDS,
}: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const initial = currentUserName ? currentUserName.charAt(0).toUpperCase() : '?'
  const canManage = userRole === 'owner' || userRole === 'manager'
  const operatorFirstName = currentUserName ? currentUserName.split(' ')[0] : null

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-xl px-2 py-1
                   hover:bg-white/10 transition-colors"
        aria-label="User menu"
      >
        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center
                        justify-center text-sm font-semibold text-orange-700">
          {initial}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round"
                strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-lg
                          border border-slate-100 z-50 overflow-hidden">

            {/* Identity block — always at top */}
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-800 truncate">{truckName || '—'}</p>
              <p className="text-xs text-slate-400 truncate mt-0.5">{operatorFirstName || currentUserName || '—'}</p>
            </div>

            {/* Screen on — mobile only */}
            <div className="sm:hidden px-4 py-2 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Screen on</span>
                <Toggle on={keepScreenOn} onToggle={() => { onToggleScreenOn(); }} />
              </div>
              {typeof navigator !== 'undefined' && !('wakeLock' in navigator) && (
                <p className="text-xs text-amber-600 mt-1">
                  Screen lock isn't supported on this browser. Keep the device plugged in and the app in the foreground to prevent the screen dimming.
                </p>
              )}
            </div>

            {/* Utility actions — mobile only */}
            <div className="sm:hidden border-b border-slate-100">
              <button
                onClick={() => { onCopyOrderLink(); setOpen(false) }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 w-full hover:bg-slate-50 text-left"
              >
                <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                {copiedOrderLink ? '✓ Copied' : 'Order link'}
              </button>
              <button
                onClick={() => { onShowQR(); setOpen(false) }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 w-full hover:bg-slate-50 text-left"
              >
                <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
                </svg>
                QR code
              </button>
              <button
                onClick={() => { onOpenKDS(); setOpen(false) }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 w-full hover:bg-slate-50 text-left"
              >
                <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
                Kitchen screen
              </button>
            </div>

            {/* Manage — owner/manager only */}
            {canManage && (
              <Link
                href={`/manage/${token}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                ⚙️ Manage
              </Link>
            )}

            {/* Orders dashboard — mobile only */}
            <a
              href={`/dashboard/${token}`}
              className="sm:hidden flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 w-full"
            >
              ← Orders dashboard
            </a>

            <hr className="border-slate-100" />

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
