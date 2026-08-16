import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveAgentRequest, buildResource, resolveFilePath } from '@/lib/agent/gate'
import { renderContextPayload } from '@/lib/agent/context'
import { callAgent } from '@/lib/agent/client'
import { isSameOrigin } from '@/lib/http/origin'

export const dynamic = 'force-dynamic'

// Only two fields are read from the browser. Everything else OpenTalon is told —
// who is asking, which package, what the page context is — is derived server-side,
// and zod strips whatever else the body carried.
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
  if (body.path && !filePath) {
    return NextResponse.json({ error: 'Unknown page' }, { status: 400 })
  }

  const context = renderContextPayload(gate.meta)
  const result = await callAgent('/session', {
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

  // streamToken and expiresAt are OpenTalon credentials. The browser authenticates to
  // the stream route with its own cookies and the route mints its own token, so there
  // is no reason for one to ever leave this process.
  return NextResponse.json({
    chatId: upstream.chatId,
    cursor: upstream.cursor ?? 0,
    contextVersion: upstream.contextVersion ?? context.version,
    history: upstream.history ?? [],
    // Echoed so the client can tell whether the context it has is current.
    serverContextVersion: context.version,
  })
}
