import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getPackageMeta, updateVisibility } from '@/lib/storage/deployments'
import { verifySession, verifyPackageSession } from '@/lib/auth/session'
import { config } from '@/lib/config'
import { packageAccessUrl } from '@/lib/storage/urls'
import type { PackageMeta, Visibility } from '@/lib/storage/types'

const postSchema = z.object({
  visibility: z.enum(['public', 'private']),
})

interface MetaResponse {
  id: string
  name: string
  visibility: Visibility
  sizeBytes?: number
  shareUrl: string
  canToggle: boolean
}

function buildShareUrl(meta: PackageMeta): string {
  if (meta.visibility === 'private' && meta.secure_token) {
    return packageAccessUrl(meta.id, meta.secure_token)
  }
  return packageAccessUrl(meta.id)
}

function buildResponse(meta: PackageMeta, canToggle: boolean): MetaResponse {
  return {
    id: meta.id,
    name: meta.name,
    visibility: meta.visibility,
    sizeBytes: meta.sizeBytes,
    shareUrl: buildShareUrl(meta),
    canToggle,
  }
}

function authorize(
  meta: PackageMeta,
  cookieHeader: string | null,
  queryToken: string | null,
): { dashboardSession: boolean; packageToken: boolean; packageSession: boolean; authorized: boolean } {
  const dashboardSession = config.authEnabled && verifySession(cookieHeader)
  const packageToken = !!(queryToken && meta.secure_token && queryToken === meta.secure_token)
  const packageSession = verifyPackageSession(cookieHeader, meta.id)
  const authorized = dashboardSession || packageToken || packageSession
  return { dashboardSession, packageToken, packageSession, authorized }
}

function canToggleFor(
  meta: PackageMeta,
  auth: { dashboardSession: boolean; packageToken: boolean; packageSession: boolean },
): boolean {
  if (auth.dashboardSession) return true
  if (meta.visibility === 'private') return auth.packageToken || auth.packageSession
  return false
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(config.publicBaseUrl).origin
  } catch {
    return false
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> },
): Promise<NextResponse> {
  const { packageId } = await params
  const meta = await getPackageMeta(packageId)
  if (!meta) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const cookieHeader = request.headers.get('cookie')
  const { searchParams } = new URL(request.url)
  const queryToken = searchParams.get('token')
  const auth = authorize(meta, cookieHeader, queryToken)

  if (meta.visibility === 'private' && !auth.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(buildResponse(meta, canToggleFor(meta, auth)))
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> },
): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }

  const { packageId } = await params
  const meta = await getPackageMeta(packageId)
  if (!meta) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const cookieHeader = request.headers.get('cookie')
  const { searchParams } = new URL(request.url)
  const queryToken = searchParams.get('token')
  const auth = authorize(meta, cookieHeader, queryToken)

  if (!canToggleFor(meta, auth)) {
    return NextResponse.json({ error: 'Not authorized to toggle visibility' }, { status: 403 })
  }

  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (body.visibility === meta.visibility) {
    return NextResponse.json(buildResponse(meta, canToggleFor(meta, auth)))
  }

  const updated = await updateVisibility(packageId, body.visibility)
  const updatedMeta = await getPackageMeta(packageId)
  return NextResponse.json(buildResponse(updatedMeta ?? updated, canToggleFor(updatedMeta ?? updated, auth)))
}