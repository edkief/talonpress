import { NextResponse, type NextRequest } from 'next/server'
import { resolveAgentRequest, buildResource, resolveFilePath } from '@/lib/agent/gate'
import { renderContextPayload } from '@/lib/agent/context'
import { callAgent, fetchAgent } from '@/lib/agent/client'

// Nothing about this response is cacheable or prerenderable, and Next's fetch cache
// would buffer the upstream body into an ArrayBuffer if it thought otherwise.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

/**
 * Relay OpenTalon's outbox stream to the browser.
 *
 * The browser never holds a stream token. Two things rule out handing one over: it is
 * an OpenTalon credential, and with more than one replica a token cached in memory on
 * the pod that opened the session may not be on the pod the EventSource lands on. So
 * this route opens its own session — idempotent, since OpenTalon derives the chatId
 * from the principal we assert — and uses the token from that. Stateless, replica-safe
 * and survives reconnects, at the cost of one extra round trip per connect.
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
    return NextResponse.json({ error: 'Agent unavailable' }, { status: 502 })
  }

  // A native EventSource reconnect carries Last-Event-ID rather than our query
  // parameter, and it is the more recent of the two, so it wins.
  const since = request.headers.get('last-event-id') ?? searchParams.get('since') ?? '0'

  let upstream: Response
  try {
    upstream = await fetchAgent(
      `/stream?token=${encodeURIComponent(streamToken)}&since=${encodeURIComponent(since)}`,
      {
        // The request's own signal, not a timeout: this connection is meant to stay
        // open, and it should end when the reader goes away. Next aborts this on
        // client disconnect, which tears down the socket to OpenTalon with it.
        signal: request.signal,
        headers: { Accept: 'text/event-stream' },
      },
    )
  } catch (err) {
    if (isDisconnect(err)) return new Response(null, { status: 499 })
    return NextResponse.json({ error: 'Agent unavailable' }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Agent unavailable' }, { status: 502 })
  }

  // Passing the body straight through keeps it unbuffered: Next writes and flushes
  // each chunk as it arrives.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform is the load-bearing half. `next start` runs compression(), which
      // skips any response whose Cache-Control matches it — without it the stream is
      // gzip-buffered and arrives all at once, at the end.
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // For nginx and friends, which buffer proxied responses by default.
      'X-Accel-Buffering': 'no',
    },
  })
}

/** A reader closing the tab is the normal way this ends, not a failure to report. */
function isDisconnect(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name
  return name === 'AbortError' || name === 'ResponseAborted'
}
