import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { config as appConfig } from '@/lib/config'

/**
 * The management surface lives entirely under `/admin`, so the UI half of the
 * gate is a single prefix — a new admin page is protected by virtue of where it
 * sits, rather than by remembering to extend a list. `/api/*` is protected too,
 * minus the endpoints that must stay reachable without an identity.
 */
const ADMIN_PREFIX = '/admin'
const PUBLIC_API_PREFIXES = [
  '/api/auth', // the login endpoint — gating it makes signing in impossible
  '/api/health', // kubelet probes carry no identity
  '/api/mcp', // agents authenticate via bearer token or proxy JWT in the handler
  '/api/pub', // package metadata, authorized per-package by token
]

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

function isProtected(pathname: string): boolean {
  if (!appConfig.authEnabled) return false
  if (matches(pathname, ADMIN_PREFIX)) return true
  if (PUBLIC_API_PREFIXES.some(p => matches(pathname, p))) return false
  return pathname.startsWith('/api/')
}

/** A browser navigation, as opposed to an API client or an agent. */
function wantsHtml(request: NextRequest): boolean {
  return (request.headers.get('accept') ?? '').includes('text/html')
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  if (!isProtected(pathname)) return NextResponse.next()

  const access = await getAccess(request)

  if (access.isAdmin) return NextResponse.next()

  // Signed in but lacking the admin role: re-authenticating won't help. Send
  // browsers to the landing page, which names the role they're missing; API
  // clients get the same information as JSON.
  if (access.authenticated) {
    if (wantsHtml(request)) return NextResponse.redirect(new URL('/', request.url))
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
  // an identity, so there is nowhere useful to send a browser but the landing page.
  if (!appConfig.sharedSecretEnabled) {
    if (wantsHtml(request)) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const returnUrl = encodeURIComponent(request.url)
  return NextResponse.redirect(new URL(`/auth?return=${returnUrl}`, request.url))
}
