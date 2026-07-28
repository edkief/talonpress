import { NextRequest, NextResponse } from 'next/server'
import { listPackages } from '@/lib/storage/deployments'
import { packageAccessUrl } from '@/lib/storage/urls'
import type { Visibility } from '@/lib/storage/types'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const visibility = searchParams.get('visibility') as Visibility | null
  const limitRaw = searchParams.get('limit')
  const limit = limitRaw ? parseInt(limitRaw, 10) : undefined

  const packages = await listPackages(visibility ?? undefined, limit)

  return NextResponse.json(
    packages.map(meta => ({
      id: meta.id,
      name: meta.name,
      visibility: meta.visibility,
      url: packageAccessUrl(meta.id, meta.secure_token),
      hash: meta.hash,
      fileCount: meta.files.length,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    })),
  )
}
