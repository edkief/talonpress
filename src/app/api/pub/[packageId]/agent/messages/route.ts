import { NextResponse, type NextRequest } from 'next/server'
import { resolveAgentRequest, buildResource, resolveFilePath } from '@/lib/agent/gate'
import { renderContextPayload } from '@/lib/agent/context'
import { callAgent, logAgentFailure } from '@/lib/agent/client'

export const dynamic = 'force-dynamic'

/**
 * Polling equivalent of the stream, for readers whose network eats SSE.
 *
 * Also the escape hatch for a subtler limit: an open EventSource holds one of the six
 * connections HTTP/1.1 browsers allow per origin — the same origin serving the
 * package's own images and stylesheets — so a client that keeps failing to stream is
 * better off polling than retrying forever.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> },
): Promise<Response> {
  const { packageId } = await params
  const { searchParams } = new URL(request.url)

  const gate = await resolveAgentRequest(request, packageId, searchParams.get('identity'))
  if (!gate.ok) return gate.response

  const filePath = resolveFilePath(gate.meta, searchParams.get('path') ?? undefined)
  const envelope = {
    resource: buildResource(gate.meta, filePath ?? undefined),
    actor: gate.actor,
    context: renderContextPayload(gate.meta),
  }

  const session = await callAgent('/session', { body: envelope }).catch(() => null)
  const streamToken = (session?.body as { streamToken?: string } | null)?.streamToken
  if (!session?.ok || !streamToken) {
    if (session?.ok) logAgentFailure('/session', { status: session.status, note: 'no streamToken in response' })
    return NextResponse.json({ error: 'Agent unavailable' }, { status: 502 })
  }

  const since = searchParams.get('since') ?? '0'
  const result = await callAgent(
    `/messages?token=${encodeURIComponent(streamToken)}&since=${encodeURIComponent(since)}`,
    { method: 'GET' },
  ).catch(() => null)

  if (!result || !result.ok) {
    return NextResponse.json({ error: 'Agent unavailable' }, { status: 502 })
  }

  const upstream = (result.body ?? {}) as Record<string, unknown>
  return NextResponse.json(
    {
      cursor: upstream.cursor ?? Number(since),
      hasMore: Boolean(upstream.hasMore),
      messages: upstream.messages ?? [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
