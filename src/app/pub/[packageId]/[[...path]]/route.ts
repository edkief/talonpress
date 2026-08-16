import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getPackageMeta } from '@/lib/storage/deployments'
import { resolveSafeFilePath, distDir } from '@/lib/storage/paths'
import { getContentType } from '@/lib/security'
import { verifyPackageSession, grantPackageSession } from '@/lib/auth/session'
import { getAccess } from '@/lib/auth/access'
import { config } from '@/lib/config'
import { renderMarkdown } from '@/lib/markdown'
import { injectBubble, type InjectBubbleOptions } from '@/lib/pubBubble/inject'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string; path?: string[] }> },
): Promise<NextResponse> {
  const { packageId, path: pathSegments = [] } = await params
  const cookieHeader = request.headers.get('cookie')
  const { searchParams } = new URL(request.url)
  const queryToken = searchParams.get('token')

  const meta = await getPackageMeta(packageId)
  if (!meta) {
    return new NextResponse('Package Not Found', { status: 404 })
  }
  if (meta.disabled) {
    return new NextResponse('Package Temporarily Unavailable', { status: 503 })
  }

  let pkgSessionCookie: string | undefined

  const hasValidToken = !!(queryToken && queryToken === meta.secure_token)
  // A management identity — authz-proxy admin or a shared-secret session. `/pub` is
  // outside the proxy-protected prefixes, so anonymous viewers land here with none.
  const access = await getAccess(request)
  const hasValidSession = config.authEnabled && access.isAdmin
  const hasPackageSession = verifyPackageSession(cookieHeader, packageId)

  if (meta.visibility === 'private') {
    if (!hasValidToken && !hasValidSession && !hasPackageSession) {
      // Only the shared-secret flow gives an anonymous viewer somewhere to sign in.
      if (config.sharedSecretEnabled) {
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

  // The bubble is only useful for users who can interact with the package — admins with a
  // valid dashboard session, or any authenticated viewer of a private package (token /
  // package session). Anonymous viewers of public packages do not get the bubble.
  const canToggle = hasValidSession || (meta.visibility === 'private' && (hasValidToken || hasPackageSession))

  // Deliberately narrower than canToggle, and matching the agent routes' own gate: a
  // package token is enough to read a private package but not to drive an agent.
  // Offering the chat to a token holder would only produce a panel that 401s.
  const canChat = config.agentEnabled && hasValidSession

  const defaultPage = meta.defaultPage ?? 'index.html'

  // Redirect bare package root to trailing-slash so relative asset URLs resolve correctly.
  // resolveSafeFilePath returns the default page for empty segments, so stat.isDirectory() would
  // never trigger for this case — handle it explicitly before path resolution.
  const url = new URL(request.url)
  if (pathSegments.length === 0 && !url.pathname.endsWith('/')) {
    const redirect = NextResponse.redirect(new URL(url.pathname + '/', config.publicBaseUrl))
    if (pkgSessionCookie) redirect.headers.set('Set-Cookie', pkgSessionCookie)
    return redirect
  }

  const safePath = resolveSafeFilePath(packageId, pathSegments, defaultPage)
  if (!safePath) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // Stat the file
  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(safePath)
  } catch {
    // Try appending the default page for directory-like requests
    const indexPath = resolveSafeFilePath(packageId, [...pathSegments, defaultPage])
    if (indexPath) {
      try {
        stat = await fs.promises.stat(indexPath)
        return withCookie(await serveFile(request, packageId, indexPath, stat, canToggle, canChat, meta.name), pkgSessionCookie)
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

    const indexPath = resolveSafeFilePath(packageId, [...pathSegments, defaultPage])
    if (indexPath) {
      try {
        const idxStat = await fs.promises.stat(indexPath)
        return withCookie(await serveFile(request, packageId, indexPath, idxStat, canToggle, canChat, meta.name), pkgSessionCookie)
      } catch {
        return new NextResponse('Not Found', { status: 404 })
      }
    }
  }

  return withCookie(await serveFile(request, packageId, safePath, stat, canToggle, canChat, meta.name), pkgSessionCookie)
}

function withCookie(response: NextResponse, cookie: string | undefined): NextResponse {
  if (cookie) response.headers.append('Set-Cookie', cookie)
  return response
}

async function serveFile(
  request: NextRequest,
  packageId: string,
  filePath: string,
  stat: fs.Stats,
  canToggle: boolean,
  canChat: boolean,
  packageName: string,
): Promise<NextResponse> {
  const ext = path.extname(filePath).slice(1).toLowerCase()

  if (ext === 'md') {
    const wantRaw = new URL(request.url).searchParams.has('raw')
    const source = await fs.promises.readFile(filePath, 'utf8')
    if (wantRaw) {
      return new NextResponse(source, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=0, must-revalidate',
        },
      })
    }
    const title = path.basename(filePath, '.md')
    const rendered = renderMarkdown(source, title)
    const body = canToggle || canChat
      ? injectBubble(rendered, bubbleOptions(packageId, filePath, title, canChat))
      : rendered
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    })
  }

  if (ext === 'html' || ext === 'htm') {
    const source = await fs.promises.readFile(filePath, 'utf8')
    const body = canToggle || canChat
      ? injectBubble(source, bubbleOptions(packageId, filePath, packageName, canChat))
      : source
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    })
  }

  return streamFile(filePath, stat)
}

/**
 * Tell the injected script which page it is on.
 *
 * The agent is told the package as the conversation's resource and the page only as
 * context, so a reader moving between pages keeps one conversation rather than
 * starting a new one per file.
 */
function bubbleOptions(packageId: string, filePath: string, title: string, canChat: boolean): InjectBubbleOptions {
  const relative = path.relative(distDir(packageId), filePath).split(path.sep).join('/')
  return {
    packageId,
    metaUrl: `/api/pub/${packageId}/meta`,
    ...(canChat
      ? {
          chat: {
            base: `/api/pub/${packageId}/agent`,
            path: relative,
            title,
            // Shared-secret admins all resolve to the same identity, so the panel
            // asks them to name themselves before it opens a conversation.
            identity: config.authzEnabled ? ('authz' as const) : ('self-declared' as const),
          },
        }
      : {}),
  }
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
