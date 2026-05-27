'use client'

import { useState } from 'react'
import Link from 'next/link'

interface UserMenuProps {
  currentUserName: string | null
  truckName: string | null
  token: string
  userRole: 'owner' | 'manager' | 'staff' | null
  vanName?: string
  onSignOut: () => void
  onEditProfile: () => void
}

export default function UserMenu({
  currentUserName,
  truckName,
  token,
  userRole,
  vanName,
  onSignOut,
  onEditProfile,
}: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const initial = currentUserName ? currentUserName.charAt(0).toUpperCase() : '?'
  const canManage = userRole === 'owner' || userRole === 'manager'

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
            {/* Info header */}
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {currentUserName || 'Unknown'}
              </p>
              {truckName && (
                <p className="text-xs text-slate-400 truncate mt-0.5">{truckName}</p>
              )}
            </div>

            {/* My profile */}
            <button
              onClick={() => { onEditProfile(); setOpen(false) }}
              className="w-full text-left flex items-center gap-2 px-4 py-2.5
                         text-sm text-slate-700 hover:bg-slate-50"
            >
              👤 My profile
            </button>

            {/* Manage — owner/manager only */}
            {canManage && !vanName && (
              <Link
                href={`/manage/${token}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm
                           text-slate-700 hover:bg-slate-50"
              >
                ⚙️ Manage
              </Link>
            )}

            {/* Plan & billing — owner only */}
            {userRole === 'owner' && (
              <Link
                href={`/manage/${token}?tab=billing`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm
                           text-slate-700 hover:bg-slate-50"
              >
                💳 Plan & billing
              </Link>
            )}

            <hr className="border-slate-100" />

            {/* Sign out */}
            <button
              onClick={() => { onSignOut(); setOpen(false) }}
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
