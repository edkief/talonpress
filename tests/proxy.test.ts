import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The proxy is the security boundary for the management surface, so assert the
// route classification directly rather than only through end-to-end requests.
// The counter proves public paths short-circuit before any session resolution.
const mock = vi.hoisted(() => ({ calls: 0 }))

vi.mock('@authz-proxy/sdk/next', () => ({
  withAuthzProxy: () => ({
    getSession: async () => {
      mock.calls++
      return {
        isAuthenticated: false,
        user: null,
        username: null,
        name: null,
        roles: [],
        isAdmin: false,
        hasRole: () => false,
        hasAnyRole: () => false,
        hasAllRoles: () => false,
        claims: null,
        raw: null,
      }
    },
  }),
}))

const ADMIN_PATHS = [
  '/admin',
  '/admin/',
  '/admin/packages',
  '/admin/packages/some-id',
  '/api/packages',
  '/api/packages/cleanup',
  '/api/docs',
]

const PUBLIC_PATHS = [
  '/',
  '/auth',
  '/api/auth',
  '/api/health',
  '/api/mcp',
  '/api/pub/some-id/meta',
  // The agent routes inherit the /api/pub exemption, so the proxy waves them
  // through and each handler runs its own admin gate. Pinned here so a change to
  // PUBLIC_API_PREFIXES that silently starts gating them shows up as a failure.
  '/api/pub/some-id/agent/session',
  '/api/pub/some-id/agent/message',
  '/api/pub/some-id/agent/stream',
  '/pub/some-id',
  '/pub/some-id/index.html',
  '/_next/static/chunk.js',
  '/favicon.ico',
]

function request(pathname: string): Request & { nextUrl: URL } {
  const url = new URL(`http://localhost:3000${pathname}`)
  const req = new Request(url) as Request & { nextUrl: URL }
  req.nextUrl = url
  return req
}

async function loadProxy() {
  const { proxy } = await import('../src/proxy')
  return proxy as unknown as (req: ReturnType<typeof request>) => Promise<Response>
}

describe('proxy route gating', () => {
  beforeEach(() => {
    vi.resetModules()
    mock.calls = 0
    process.env.PUBLIC_BASE_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    delete process.env.TALONPRESS_SHARED_SECRET
    delete process.env.AUTHZ_PROXY_URL
    delete process.env.PUBLIC_BASE_URL
  })

  it.each(PUBLIC_PATHS)('leaves %s public', async pathname => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    const proxy = await loadProxy()
    const res = await proxy(request(pathname))

    expect(res.headers.get('x-middleware-next')).toBeTruthy()
    // Short-circuits before resolving an identity at all.
    expect(mock.calls).toBe(0)
  })

  it.each(ADMIN_PATHS)('gates %s', async pathname => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    const proxy = await loadProxy()
    const res = await proxy(request(pathname))

    // Denied: a JSON 401/403 or a redirect, never a pass-through.
    expect(res.headers.get('x-middleware-next')).toBeNull()
    expect([401, 403, 307]).toContain(res.status)
  })

  it('gates nothing when no auth is configured', async () => {
    const proxy = await loadProxy()
    for (const pathname of [...ADMIN_PATHS, ...PUBLIC_PATHS]) {
      const res = await proxy(request(pathname))
      expect(res.headers.get('x-middleware-next')).toBeTruthy()
    }
  })

  it('sends denied browsers to /auth when shared-secret login exists', async () => {
    process.env.TALONPRESS_SHARED_SECRET = 'secret'
    const proxy = await loadProxy()
    const req = request('/admin')
    req.headers.set('accept', 'text/html')

    const res = await proxy(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/auth?return=')
  })

  it('sends denied browsers to the landing page when there is no login page', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    const proxy = await loadProxy()
    const req = request('/admin')
    req.headers.set('accept', 'text/html')

    const res = await proxy(req)
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/')
  })

  it('gives non-browser clients JSON rather than a redirect', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    const proxy = await loadProxy()

    const res = await proxy(request('/admin'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })
})
