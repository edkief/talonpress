import { NextRequest, NextResponse } from 'next/server'
import { deleteOldPackages } from '@/lib/storage/deployments'
import { verifySession } from '@/lib/auth/session'
import { timingSafeCompare } from '@/lib/auth/secret'
import { config } from '@/lib/config'

const DEFAULT_MAX_AGE_DAYS = 30

// Authorize via either a dashboard session cookie (UI button) or a
// `Bearer <shared secret>` header (CLI / automation). Mirrors the auth used by
// the MCP transport and the dashboard. When auth is disabled, allow all.
function isAuthorized(request: NextRequest): boolean {
  if (!config.authEnabled) return true
  if (verifySession(request.headers.get('cookie'))) return true
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return timingSafeCompare(token, config.sharedSecret)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
