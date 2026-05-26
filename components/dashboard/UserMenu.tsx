'use client'

import { useState } from 'react'
import Link from 'next/link'

interface UserMenuProps {
  currentUserName: string | null
  truckName: string | null
  token: string
  keepScreenOn: boolean
  userRole: 'owner' | 'manager' | 'staff' | null
  vanName?: string
  onToggleScreen: () => void
  onSignOut: () => void
  onEditProfile: () => void
}

export default function UserMenu({
  currentUserName,
  truckName,
  token,
  keepScreenOn,
  userRole,
  vanName,
  onToggleScreen,
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
        className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center
                   text-xs font-semibold text-orange-700 focus:outline-none shrink-0"
        aria-label="User menu"
      >
        {initial}
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

            <hr className="border-slate-100" />

            {/* Keep screen on toggle */}
            <div className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm text-slate-700">
                {keepScreenOn ? 'Screen on' : 'Screen off'}
              </span>
              <button
                onClick={() => { onToggleScreen(); setOpen(false) }}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0
                            ${keepScreenOn ? 'bg-teal-600' : 'bg-slate-300'}`}
                title={keepScreenOn ? 'Screen will stay on' : 'Screen may turn off'}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full
                               shadow transition-transform
                               ${keepScreenOn ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

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
