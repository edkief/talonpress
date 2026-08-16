import { createMcpHandler } from 'mcp-handler'
import { setupServer } from '@/lib/mcp/server'
import { config } from '@/lib/config'
import { timingSafeCompare } from '@/lib/auth/secret'
import { getAuthzSession } from '@/lib/auth/authz'

if (config.mcpAuthMode === 'none') {
  console.warn(
    '[talonpress] TALONPRESS_MCP_AUTH=none — the MCP API accepts unauthenticated requests. ' +
    'This assumes every non-cluster route to this pod terminates at authz-proxy first; ' +
    'anything able to reach the pod port directly can publish and delete packages.',
  )
} else if (!config.authEnabled) {
  console.warn(
    '[talonpress] WARNING: neither TALONPRESS_SHARED_SECRET nor AUTHZ_PROXY_URL is set. ' +
    'The MCP API is open to unauthenticated requests.',
  )
} else if (!config.sharedSecretEnabled) {
  console.warn(
    '[talonpress] TALONPRESS_SHARED_SECRET is not set. MCP clients must reach the API ' +
    'through authz-proxy; a bearer-token credential is unavailable.',
  )
}

const mcpHandler = createMcpHandler(
  (server) => setupServer(server),
  {
    serverInfo: {
      name: 'talonpress',
      version: '0.1.0',
    },
  },
  {
    basePath: '/api',
    // We only support the stateless streamable HTTP transport (/api/mcp).
    // The legacy SSE transport (/api/sse) requires a Redis backend for session
    // coordination; without REDIS_URL/KV_URL it throws "redisUrl is required"
    // as an unhandledRejection whenever a client hits /api/sse.
    disableSse: true,
    verboseLogs: process.env.NODE_ENV === 'development' || process.env.MCP_VERBOSE_LOGS === 'true',
  },
)

/**
 * MCP clients are machines: they cannot complete an interactive sign-in, so the
 * `Bearer <shared secret>` credential stays the primary path here even when
 * authz-proxy is enabled. Requests that *do* arrive through the proxy (which
 * forwards `X-Auth-Request-JWT`) are accepted too, provided the user holds the
 * admin role — that lets a proxied deployment drop the shared secret entirely.
 */
async function withAuth(req: Request, handler: (r: Request) => Promise<Response>): Promise<Response> {
  // `TALONPRESS_MCP_AUTH=none` opts this transport out of the app-wide gate, for
  // in-cluster callers that reach the pod over an internal Service and so carry
  // neither proxy headers nor a shared secret. Scoped to /api/mcp only — every
  // other route, including /api/packages/cleanup, stays gated.
  if (!config.mcpAuthEnabled) return handler(req)

  if (config.sharedSecretEnabled) {
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (timingSafeCompare(token, config.sharedSecret)) return handler(req)
  }

  const authz = await getAuthzSession(req)
  if (authz?.isAdmin) return handler(req)

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(req: Request): Promise<Response> {
  return withAuth(req, mcpHandler)
}

export async function POST(req: Request): Promise<Response> {
  return withAuth(req, mcpHandler)
}

export async function DELETE(req: Request): Promise<Response> {
  return withAuth(req, mcpHandler)
}
