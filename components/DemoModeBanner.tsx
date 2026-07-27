// components/DemoModeBanner.tsx
// THE demo-mode indicator. One component, three surfaces: the demo dashboard, the kitchen screen and the
// customer order page.
//
// EXTRACTED because it was three separate copies that had ALREADY drifted — same strip, three different
// sentences, two different layout wrappers. A persistent indicator is exactly the thing that quietly
// diverges.
//
// ── COLOUR: white ground, ORANGE label ─────────────────────────────────────────────────────────────
// Iterated: amber-400 (too saturated, fought the palette), amber-100 (calmer but still a tint competing
// with the chips), pure white (clean, but it BLED — the KDS header and the order page are also white, so
// the bar stopped reading as a state at all), now a barely-there orange-50 ground with the page's own
// orange for the label.
//
// orange-50 is doing something specific: it is distinct from BOTH surfaces this sits against — white (KDS
// header, order-page content) and slate-50 (dashboard page) — which pure white was not. It's warm enough
// to belong to the orange label without becoming a wash that tints every screen for the whole session.
// The slate-900 bottom border still gives the hard edge against the navy header below.
//
// ── COPY + TYPE ────────────────────────────────────────────────────────────────────────────────────
// "DEMO MODE" — bold caps at NORMAL tracking. Letterspacing was the thing making it read as a system
// alert; caps alone are enough to make it unmissable. The explanatory sentences that used to live here
// moved to the one-time welcome popups, which say it once properly rather than repeating forever.
//
// ── LAYOUT ─────────────────────────────────────────────────────────────────────────────────────────
// The label is CENTRED ON THE BANNER, not centred in the space left over by the CTA — so it doesn't shift
// depending on whether a button is present or how wide it is. The CTA is absolutely positioned right.

export function DemoModeBanner({ className = '', action, innerRef }: {
  /** Positioning for the host surface. Defaults to the app-shell strip treatment (dashboard + KDS, which
   *  are h-dvh flex columns and need `shrink-0`). The customer order page passes its own sticky offset
   *  because it sits under a 60px sticky header rather than in a flex shell. */
  className?: string
  /** Right-aligned slot for the persistent CTA. */
  action?: React.ReactNode
  /** Optional handle on the outer strip so a host can MEASURE it. The customer order page needs the
   *  rendered height to offset the sticky bars that stack beneath this one — see the sticky-stack note in
   *  app/trucks/[slug]/order/page.tsx. Purely additive: the dashboard and KDS pass nothing. */
  innerRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <div ref={innerRef} className={`w-full bg-orange-50 px-4 py-2 shrink-0 border-b-2 border-slate-900 ${className}`}>
      <div className="relative w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex items-center justify-center min-h-[1.75rem]">
        <span className="text-base font-black text-orange-600">DEMO MODE</span>
        {action && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2">{action}</div>
        )}
      </div>
    </div>
  )
}
