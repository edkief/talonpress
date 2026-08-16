import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveAgentRequest, buildResource, resolveFilePath } from '@/lib/agent/gate'
import { renderContextPayload } from '@/lib/agent/context'
import { callAgent } from '@/lib/agent/client'
import { isSameOrigin } from '@/lib/http/origin'

export const dynamic = 'force-dynamic'

const MAX_MESSAGE_CHARS = 8000

const bodySchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_CHARS),
  clientMessageId: z.string().max(128).optional(),
  path: z.string().optional(),
  identity: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> },
): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }

  const { packageId } = await params

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const gate = await resolveAgentRequest(request, packageId, body.identity)
  if (!gate.ok) return gate.response

  const filePath = resolveFilePath(gate.meta, body.path)
  if (body.path && !filePath) {
    return NextResponse.json({ error: 'Unknown page' }, { status: 400 })
  }

  const result = await callAgent('/message', {
    body: {
      resource: buildResource(gate.meta, filePath ?? undefined),
      actor: gate.actor,
      context: renderContextPayload(gate.meta),
      message: body.message,
      ...(body.clientMessageId ? { clientMessageId: body.clientMessageId } : {}),
    },
  }).catch(() => null)

  if (!result) {
    return NextResponse.json({ error: 'Agent unavailable' }, { status: 502 })
  }

  if (!result.ok) {
    // Rate limiting is OpenTalon's to enforce — it meters the model and sees every
    // channel, where this process only sees its own replica. Relay its verdict
    // faithfully so the client can back off by the interval it was given.
    if (result.status === 429) {
      const retryAfter = (result.body as { retryAfter?: number } | null)?.retryAfter
      return NextResponse.json(
        { error: 'Too many messages', ...(retryAfter ? { retryAfter } : {}) },
        { status: 429, headers: retryAfter ? { 'Retry-After': String(retryAfter) } : undefined },
      )
    }
    return NextResponse.json(...mapUpstreamFailure(result.status))
  }

  const upstream = (result.body ?? {}) as Record<string, unknown>
  return NextResponse.json(
    {
      chatId: upstream.chatId,
      turnId: upstream.turnId,
      cursor: upstream.cursor,
      ...(upstream.duplicate ? { duplicate: true } : {}),
    },
    { status: 202 },
  )
}

/**
 * Upstream bodies are never relayed — they can carry conversation content and
 * internal detail. A 403 means OpenTalon rejected the chatId we derived, which is a
 * bug on this side rather than anything the caller did wrong.
 */
function mapUpstreamFailure(status: number): [{ error: string }, { status: number }] {
  if (status === 403) return [{ error: 'Agent rejected the conversation' }, { status: 500 }]
  if (status >= 400 && status < 500) return [{ error: 'Agent rejected the request' }, { status }]
  return [{ error: 'Agent unavailable' }, { status: 502 }]
}
