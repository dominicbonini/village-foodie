import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/manage/:path*',
    '/kds/:path*',
    '/login',
    '/forgot-password',
    '/reset-password',
    '/admin/:path*',
  ],
}
