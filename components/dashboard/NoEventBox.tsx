'use client'
// components/dashboard/NoEventBox.tsx — the amber "no event" box on the dashboard's Orders tab and Add order
// (events-create-2, 17 November 2026). One component so both read the same: the message ("No event selected" /
// "Approve an event to take orders"), "Select event", and — new — "Create event now", which is disabled with its
// reason in words when the device is offline or the caller is not a signed-in member of the truck.
// ⚠️ IT WRAPS RATHER THAN SQUEEZES: on a 320px phone the two buttons drop under the message instead of shrinking it.

export function NoEventBox({ message, selectLabel, onSelect, createLabel, onCreate, createDisabled = false, createNote = null }: {
  message: string
  selectLabel: string
  onSelect: () => void
  /** Absent → no create button (a demo, or a screen that cannot create). */
  createLabel?: string
  onCreate?: () => void
  createDisabled?: boolean
  /** Why the create button is disabled (offline, not signed in), shown under the buttons. */
  createNote?: string | null
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3" data-no-event-box>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-amber-500" aria-hidden>⚠️</span>
          <p className="text-sm font-medium text-amber-800">{message}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onSelect}
            className="text-sm font-semibold text-amber-700 border border-amber-300 bg-white rounded-lg px-3 py-1.5 hover:bg-amber-50 whitespace-nowrap">
            {selectLabel}
          </button>
          {createLabel && onCreate && (
            <button onClick={onCreate} disabled={createDisabled} data-create-event-button
              className="text-sm font-semibold text-white bg-orange-600 rounded-lg px-3 py-1.5 hover:bg-orange-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
              {createLabel}
            </button>
          )}
        </div>
      </div>
      {createLabel && createDisabled && createNote && <p className="text-xs text-amber-800 mt-2">{createNote}</p>}
    </div>
  )
}
