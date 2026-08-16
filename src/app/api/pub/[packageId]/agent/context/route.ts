import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveAgentRequest, buildResource, resolveFilePath } from '@/lib/agent/gate'
import { renderContextPayload } from '@/lib/agent/context'
import { callAgent } from '@/lib/agent/client'
import { isSameOrigin } from '@/lib/http/origin'

export const dynamic = 'force-dynamic'

/**
 * Push the stored page context to OpenTalon.
 *
 * Note what this route does *not* accept: a context. The blob is authored over MCP by
 * whoever publishes the package, and rendered here from storage. Letting the browser
 * supply one would let any admin rewrite the prompt prefix that every other reader of
 * that package shares.
 *
 * The client calls this when the version it holds diverges from the server's — after
 * a republish, essentially. Calling it on plain navigation is a cheap no-op, because
 * the reader's page is not part of the context.
 */
const bodySchema = z.object({
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
  const context = renderContextPayload(gate.meta)

  const result = await callAgent('/context', {
    body: {
      resource: buildResource(gate.meta, filePath ?? undefined),
      actor: gate.actor,
      context,
    },
  }).catch(() => null)

  if (!result || !result.ok) {
    return NextResponse.json({ error: 'Agent unavailable' }, { status: 502 })
  }

  const upstream = (result.body ?? {}) as Record<string, unknown>
  return NextResponse.json({
    ok: true,
    version: upstream.version ?? context.version,
    changed: Boolean(upstream.changed),
  })
}
