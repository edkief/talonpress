import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth/session'
import { config as appConfig } from '@/lib/config'

const PUBLIC_PREFIXES = ['/auth', '/api/mcp', '/pub', '/_next', '/favicon', '/_not-found']

function isProtected(pathname: string): boolean {
  if (!appConfig.authEnabled) return false
  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return false
  if (pathname === '/') return true
  return pathname.startsWith('/packages') || pathname.startsWith('/api/')
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  if (!isProtected(pathname)) return NextResponse.next()

  if (verifySession(request.headers.get('cookie'))) return NextResponse.next()

  const returnUrl = encodeURIComponent(request.url)
  return NextResponse.redirect(new URL(`/auth?return=${returnUrl}`, request.url))
}
