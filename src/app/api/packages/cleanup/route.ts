import { NextRequest, NextResponse } from 'next/server'
import { deleteOldPackages } from '@/lib/storage/deployments'
import { getAccess } from '@/lib/auth/access'

const DEFAULT_MAX_AGE_DAYS = 30

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Destructive, so admin only: an authz-proxy user holding TALONPRESS_ADMIN_ROLE,
  // a dashboard session cookie (UI button), or `Bearer <shared secret>` (CLI).
  const access = await getAccess(request)
  if (!access.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: access.authenticated ? 403 : 401 })
  }

  // Accept the threshold from a JSON body or the `days` query param; fall back
  // to 30 days. Reject non-positive values so a stray `0` can't wipe everything.
  let days = DEFAULT_MAX_AGE_DAYS
  const { searchParams } = new URL(request.url)
  const queryDays = searchParams.get('days')
  if (queryDays !== null) {
    days = parseInt(queryDays, 10)
  } else if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = await request.json()
      if (typeof body?.days === 'number') days = body.days
    } catch {
      // empty/invalid body — keep default
    }
  }

  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ error: 'days must be a positive number' }, { status: 400 })
  }

  const { deleted } = await deleteOldPackages(days)

  return NextResponse.json({ days, deletedCount: deleted.length, deleted })
}
