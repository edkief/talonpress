import { NextRequest, NextResponse } from 'next/server'
import { timingSafeCompare } from '@/lib/auth/secret'
import { createSessionCookie } from '@/lib/auth/session'
import { config } from '@/lib/config'

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!config.authEnabled) {
    return NextResponse.json({ error: 'Auth is not enabled' }, { status: 400 })
  }

  let token: string
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = await request.json()
    token = body.token ?? ''
  } else {
    const formData = await request.formData()
    token = (formData.get('token') as string) ?? ''
  }

  if (!timingSafeCompare(token, config.sharedSecret)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const returnUrl = request.nextUrl.searchParams.get('return') ?? '/'

  // Validate return URL is same-origin to prevent open redirect
  let safeReturn = '/'
  try {
    const parsed = new URL(returnUrl)
    const base = new URL(config.publicBaseUrl)
    if (parsed.origin === base.origin) {
      safeReturn = parsed.pathname + parsed.search
    }
  } catch {
    // returnUrl was a relative path
    if (returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      safeReturn = returnUrl
    }
  }

  const response = NextResponse.redirect(new URL(safeReturn, request.url))
  response.headers.set('Set-Cookie', createSessionCookie())
  return response
}
