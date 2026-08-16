import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { config as appConfig } from '@/lib/config'

const PUBLIC_PREFIXES = ['/auth', '/api/mcp', '/api/pub', '/pub', '/_next', '/favicon', '/_not-found']

function isProtected(pathname: string): boolean {
  if (!appConfig.authEnabled) return false
  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return false
  if (pathname === '/') return true
  return pathname.startsWith('/packages') || pathname.startsWith('/api/')
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  if (!isProtected(pathname)) return NextResponse.next()

  const access = await getAccess(request)

  if (access.isAdmin) return NextResponse.next()

  // Signed in via authz-proxy but lacking the admin role: re-authenticating won't
  // help, so say what's missing instead of bouncing them through a login loop.
  if (access.authenticated) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: `The "${appConfig.authzAdminRole}" role is required to manage TalonPress.`,
        user: access.username,
      },
      { status: 403 },
    )
  }

  // The shared-secret login page is the only interactive sign-in we host. Without
  // it, an unauthenticated request means the upstream authz-proxy did not forward
  // an identity — a 401 lets the proxy handle the sign-in.
  if (!appConfig.sharedSecretEnabled) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const returnUrl = encodeURIComponent(request.url)
  return NextResponse.redirect(new URL(`/auth?return=${returnUrl}`, request.url))
}
