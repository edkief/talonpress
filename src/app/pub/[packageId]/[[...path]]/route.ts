import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { getPackageMeta } from '@/lib/storage/deployments'
import { resolveSafeFilePath } from '@/lib/storage/paths'
import { getContentType } from '@/lib/security'
import { verifySession } from '@/lib/auth/session'
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

  if (meta.visibility === 'private') {
    const { searchParams } = new URL(request.url)
    const queryToken = searchParams.get('token')

    // Accept query token or a valid session
    const hasValidToken = queryToken && queryToken === meta.secure_token
    const hasValidSession = verifySession(request.headers.get('cookie'))

    if (!hasValidToken && !hasValidSession) {
      if (config.authEnabled) {
        const returnUrl = encodeURIComponent(request.url)
        return NextResponse.redirect(new URL(`/auth?return=${returnUrl}`, request.url))
      }
      return new NextResponse('Unauthorized: Invalid or missing token parameter.', { status: 401 })
    }
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
        return streamFile(indexPath, stat)
      } catch {
        // fall through
      }
    }
    return new NextResponse('Not Found', { status: 404 })
  }

  if (stat.isDirectory()) {
    const indexPath = resolveSafeFilePath(packageId, [...pathSegments, 'index.html'])
    if (indexPath) {
      try {
        const idxStat = await fs.promises.stat(indexPath)
        return streamFile(indexPath, idxStat)
      } catch {
        return new NextResponse('Not Found', { status: 404 })
      }
    }
  }

  return streamFile(safePath, stat)
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
