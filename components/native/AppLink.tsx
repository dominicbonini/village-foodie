'use client'
import { useRouter } from 'next/navigation'
import type { AnchorHTMLAttributes } from 'react'
import { isNativeApp } from '@/lib/native/device'

/**
 * Anchor that keeps INTERNAL app navigation inside the app.
 *
 * On WEB it renders a plain <a> and behaves EXACTLY as before — same href, same target (incl. _blank),
 * full-document nav / new tab unchanged (isNativeApp() is false → the click is never intercepted).
 *
 * In the native WKWebView shell an internal-route <a> — especially target="_blank" — escapes to Safari or
 * hard-reloads the shell; so when isNativeApp(), the click is intercepted and routed via the client router
 * (in-app soft nav, stays in the webview).
 *
 * Use for INTERNAL app routes ONLY (/dashboard, /manage, /kds, /admin). EXTERNAL URLs must stay a plain <a>
 * (schedule links, "View original card", external sites — those SHOULD open outside the app).
 */
export function AppLink({
  href,
  onClick,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const router = useRouter()
  return (
    <a
      {...rest}
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        if (isNativeApp()) {
          e.preventDefault()
          router.push(href)
        }
      }}
    >
      {children}
    </a>
  )
}
