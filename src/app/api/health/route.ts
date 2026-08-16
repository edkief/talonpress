import { NextResponse } from 'next/server'

// Public by design: kubelet probes carry no proxy headers and no shared secret,
// so this route is excluded from the auth gate in src/proxy.ts. It reports only
// process liveness — never configuration, identity, or storage contents.
export const dynamic = 'force-dynamic'

export function GET(): NextResponse {
  return NextResponse.json(
    { status: 'ok', uptime: Math.floor(process.uptime()) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
