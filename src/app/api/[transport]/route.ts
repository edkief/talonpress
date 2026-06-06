import { createMcpHandler } from 'mcp-handler'
import { setupServer } from '@/lib/mcp/server'
import { config } from '@/lib/config'
import { timingSafeCompare } from '@/lib/auth/secret'

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
    verboseLogs: process.env.NODE_ENV === 'development',
  },
)

async function withAuth(req: Request, handler: (r: Request) => Promise<Response>): Promise<Response> {
  if (!config.authEnabled) return handler(req)

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!timingSafeCompare(token, config.sharedSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return handler(req)
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
