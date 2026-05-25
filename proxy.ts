import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Domain redirect: operator routes on villagefoodie.co.uk → hatchgrab.com ──
  const host = request.headers.get('host') || ''
  const isVillageFoodie =
    host === 'villagefoodie.co.uk' ||
    host === 'www.villagefoodie.co.uk'

  const operatorPaths = ['/dashboard', '/manage', '/kds', '/login',
                         '/forgot-password', '/reset-password', '/admin']
  const isOperatorRoute = operatorPaths.some(p => pathname.startsWith(p))

  if (isVillageFoodie && isOperatorRoute) {
    return NextResponse.redirect(
      `https://www.hatchgrab.com${pathname}${request.nextUrl.search}`
    )
  }

  // ── Supabase auth session ──────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes — require authentication
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/manage') ||
    pathname.startsWith('/kds')

  // Public routes — always accessible
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/' ||
    pathname.startsWith('/trucks') ||
    pathname.startsWith('/venues') ||
    pathname.startsWith('/help')

  if (isProtected && !user) {
    // Not logged in — redirect to login with return URL
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === '/login' && user) {
    // Already logged in — redirect to dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next_next/image|favicon.ico|apple-touch-icon.png|logos|photos|sw.js|manifest.json|offline.html).*)',
  ],
}
