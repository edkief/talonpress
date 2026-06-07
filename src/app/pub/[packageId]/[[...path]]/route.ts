import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { getPackageMeta } from '@/lib/storage/deployments'
import { resolveSafeFilePath } from '@/lib/storage/paths'
import { getContentType } from '@/lib/security'
import { verifySession, verifyPackageSession, grantPackageSession } from '@/lib/auth/session'
import { config } from '@/lib/config'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string; path?: string[] }> },
): Promise<NextResponse> {
  const { packageId, path: pathSegments = [] } = await params

  const meta = await getPackageMeta(packageId)
  if (!meta) {
    return new NextResponse('Package Not Found', { status: 404 })
  }
  if (meta.disabled) {
    return new NextResponse('Package Temporarily Unavailable', { status: 503 })
  }

  let pkgSessionCookie: string | undefined

  if (meta.visibility === 'private') {
    const { searchParams } = new URL(request.url)
    const queryToken = searchParams.get('token')
    const cookieHeader = request.headers.get('cookie')

    const hasValidToken = !!(queryToken && queryToken === meta.secure_token)
    const hasValidSession = config.authEnabled && verifySession(cookieHeader)
    const hasPackageSession = verifyPackageSession(cookieHeader, packageId)

    if (!hasValidToken && !hasValidSession && !hasPackageSession) {
      if (config.authEnabled) {
        const returnUrl = encodeURIComponent(request.url)
        return NextResponse.redirect(new URL(`/auth?return=${returnUrl}`, request.url))
      }
      return new NextResponse('Unauthorized: Invalid or missing token parameter.', { status: 401 })
    }

    // Promote a valid query token to a session cookie so assets load without the token
    if (hasValidToken) {
      pkgSessionCookie = grantPackageSession(cookieHeader, packageId)
    }
  }

  // Redirect bare package root to trailing-slash so relative asset URLs resolve correctly.
  // resolveSafeFilePath returns index.html for empty segments, so stat.isDirectory() would
  // never trigger for this case — handle it explicitly before path resolution.
  const url = new URL(request.url)
  if (pathSegments.length === 0 && !url.pathname.endsWith('/')) {
    const redirect = NextResponse.redirect(new URL(url.pathname + '/', config.publicBaseUrl))
    if (pkgSessionCookie) redirect.headers.set('Set-Cookie', pkgSessionCookie)
    return redirect
  }

  const safePath = resolveSafeFilePath(packageId, pathSegments)
  if (!safePath) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // Stat the file
  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(safePath)
  } catch {
    // Try appending index.html for directory-like requests
    const indexPath = resolveSafeFilePath(packageId, [...pathSegments, 'index.html'])
    if (indexPath) {
      try {
        stat = await fs.promises.stat(indexPath)
        return withCookie(streamFile(indexPath, stat), pkgSessionCookie)
      } catch {
        // fall through
      }
    }
    return new NextResponse('Not Found', { status: 404 })
  }

  if (stat.isDirectory()) {
    // Redirect to trailing-slash URL so relative asset paths (img src, scripts) resolve correctly
    const url = new URL(request.url)
    if (!url.pathname.endsWith('/')) {
      const redirect = NextResponse.redirect(new URL(url.pathname + '/', config.publicBaseUrl))
      if (pkgSessionCookie) redirect.headers.set('Set-Cookie', pkgSessionCookie)
      return redirect
    }

    const indexPath = resolveSafeFilePath(packageId, [...pathSegments, 'index.html'])
    if (indexPath) {
      try {
        const idxStat = await fs.promises.stat(indexPath)
        return withCookie(streamFile(indexPath, idxStat), pkgSessionCookie)
      } catch {
        return new NextResponse('Not Found', { status: 404 })
      }
    }
  }

  return withCookie(streamFile(safePath, stat), pkgSessionCookie)
}

function withCookie(response: NextResponse, cookie: string | undefined): NextResponse {
  if (cookie) response.headers.append('Set-Cookie', cookie)
  return response
}

function streamFile(filePath: string, stat: fs.Stats): NextResponse {
  const contentType = getContentType(filePath)
  const stream = fs.createReadStream(filePath)

  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
