'use client'
// components/shared/IsolatedSections.tsx — app-fixes-1 (14 November 2026, docs/app-fixes-1-report.md §3).
//
// 🔴 ONE BROKEN SECTION MUST NEVER TAKE DOWN THE WHOLE SCREEN. The dashboard's Paramètres tab went to the error page in the
// app because ONE card (kitchen-ticket printing) threw while rendering: a render error unwinds to the nearest error
// boundary, and the only one was the route's (app/(app)/error.tsx), so every other setting disappeared with it.
// This wraps EACH DIRECT CHILD in its own boundary: a section that throws is replaced by a one-line notice with "Try again",
// and every other section stays on screen and usable. No wrapper element per child — the children render exactly as before
// (the parent's `space-y-4` still spaces them), so nothing moves when nothing breaks.
// The error is still logged (console.error) so it can be found.
import { Children, Component, isValidElement, type ErrorInfo, type ReactNode } from 'react'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/errorPage'

function SectionFailed({ onRetry }: { onRetry: () => void }) {
  const t = useT('errorPage')
  return (
    <div role="alert" data-section-failed="" className="bg-white rounded-2xl shadow-sm border border-amber-200 p-4 flex items-center justify-between gap-3">
      <p className="text-sm text-amber-800 min-w-0">{t('sectionFailed')}</p>
      <button type="button" onClick={onRetry} className="shrink-0 text-sm font-semibold text-orange-600 hover:text-orange-700">{t('retry')}</button>
    </div>
  )
}

class SectionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[IsolatedSections] a section failed to render and was contained:', error, info.componentStack)
  }
  render() { return this.state.failed ? <SectionFailed onRetry={() => this.setState({ failed: false })} /> : this.props.children }
}

/** A child whose JSX is BUILT inside its boundary. Inline JSX in a parent — `{cond&&(<div>{format(x)}</div>)}`, an
 *  `(()=>{…})()` — is evaluated while the PARENT renders, so a throw there is the parent's and no child boundary can catch
 *  it. `<Section>{() => …}</Section>` defers that work into this component's own render, inside IsolatedSections' boundary. */
export function Section({ children }: { children: () => ReactNode }) {
  return <>{children()}</>
}

/** A container whose every direct child is its own error boundary. Drop-in for `<div className=…>`. */
export function IsolatedSections({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      {Children.toArray(children).map((child, i) => (
        <SectionBoundary key={isValidElement(child) && child.key != null ? child.key : i}>{child}</SectionBoundary>
      ))}
    </div>
  )
}
