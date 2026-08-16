import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AuthzSession } from '@authz-proxy/sdk/next'

// Stand in for the SDK so these tests exercise our access rules, not JWKS verification.
const mock = vi.hoisted(() => ({ session: null as AuthzSession | null, adminRoles: [] as string[] }))

vi.mock('@authz-proxy/sdk/next', () => ({
  withAuthzProxy: (cfg: { adminRoles?: string[] }) => {
    mock.adminRoles = cfg.adminRoles ?? []
    return { getSession: async () => mock.session ?? unauthenticated() }
  },
}))

function unauthenticated(): AuthzSession {
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
}

function proxyUser(name: string, username: string, roles: string[], adminRole: string): AuthzSession {
  return {
    isAuthenticated: true,
    user: { username, email: username, name, roles },
    username,
    name,
    roles,
    isAdmin: roles.includes(adminRole),
    hasRole: (r: string) => roles.includes(r),
    hasAnyRole: (...r: string[]) => r.some(x => roles.includes(x)),
    hasAllRoles: (...r: string[]) => r.every(x => roles.includes(x)),
    claims: null,
    raw: null,
  }
}

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/', { headers })
}

describe('auth/access', () => {
  beforeEach(() => {
    vi.resetModules()
    mock.session = null
    process.env.PUBLIC_BASE_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    delete process.env.TALONPRESS_SHARED_SECRET
    delete process.env.AUTHZ_PROXY_URL
    delete process.env.TALONPRESS_ADMIN_ROLE
    delete process.env.AUTHZ_ROLE_SOURCE
    delete process.env.TALONPRESS_MCP_AUTH
    delete process.env.PUBLIC_BASE_URL
  })

  it('is fully open when no mechanism is configured', async () => {
    const { getAccess } = await import('../src/lib/auth/access')
    const access = await getAccess(request())
    expect(access).toMatchObject({ authenticated: true, isAdmin: true, via: 'open' })
  })

  it('denies an anonymous request once a mechanism is configured', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    const { getAccess } = await import('../src/lib/auth/access')
    const access = await getAccess(request())
    expect(access).toMatchObject({ authenticated: false, isAdmin: false, via: 'none' })
  })

  it('defaults the admin role to talonpress-admin', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    const { config } = await import('../src/lib/config')
    expect(config.authzAdminRole).toBe('talonpress-admin')

    mock.session = proxyUser('Ada Lovelace', 'ada@example.com', ['talonpress-admin'], 'talonpress-admin')
    const { getAccess } = await import('../src/lib/auth/access')
    const access = await getAccess(request())

    expect(mock.adminRoles).toEqual(['talonpress-admin'])
    expect(access).toMatchObject({
      authenticated: true,
      isAdmin: true,
      name: 'Ada Lovelace',
      username: 'ada@example.com',
      via: 'authz',
    })
  })

  it('honours a custom admin role from the environment', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    process.env.TALONPRESS_ADMIN_ROLE = 'role-publisher'
    const { config } = await import('../src/lib/config')
    expect(config.authzAdminRole).toBe('role-publisher')

    mock.session = proxyUser('Grace', 'grace@example.com', ['role-publisher'], 'role-publisher')
    const { getAccess } = await import('../src/lib/auth/access')
    const access = await getAccess(request())
    expect(mock.adminRoles).toEqual(['role-publisher'])
    expect(access.isAdmin).toBe(true)
  })

  it('authenticates a non-admin proxy user without granting admin', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    mock.session = proxyUser('Bob Viewer', 'bob@example.com', ['role-viewer'], 'talonpress-admin')

    const { getAccess } = await import('../src/lib/auth/access')
    const access = await getAccess(request())

    expect(access.authenticated).toBe(true)
    expect(access.isAdmin).toBe(false)
    expect(access.roles).toEqual(['role-viewer'])
  })

  it('falls back to the username when the proxy sends no display name', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    const session = proxyUser('', 'carol@example.com', ['talonpress-admin'], 'talonpress-admin')
    mock.session = { ...session, name: null, user: { ...session.user!, name: undefined } }

    const { getAccess } = await import('../src/lib/auth/access')
    expect((await getAccess(request())).name).toBe('carol@example.com')
  })

  it('still accepts the shared secret as a bearer token alongside authz', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    process.env.TALONPRESS_SHARED_SECRET = 'machine-token'

    const { getAccess } = await import('../src/lib/auth/access')
    const access = await getAccess(request({ authorization: 'Bearer machine-token' }))

    expect(access).toMatchObject({ authenticated: true, isAdmin: true, via: 'shared-secret' })
  })

  it('rejects a wrong bearer token', async () => {
    process.env.TALONPRESS_SHARED_SECRET = 'machine-token'
    const { getAccess } = await import('../src/lib/auth/access')
    const access = await getAccess(request({ authorization: 'Bearer nope' }))
    expect(access.authenticated).toBe(false)
  })

  it('accepts the shared-secret dashboard cookie', async () => {
    process.env.TALONPRESS_SHARED_SECRET = 'machine-token'
    const { createSessionCookie } = await import('../src/lib/auth/session')
    const value = createSessionCookie().match(/tp_session=([^;]+)/)![1]

    const { getAccess } = await import('../src/lib/auth/access')
    const access = await getAccess(request({ cookie: `tp_session=${value}` }))

    expect(access).toMatchObject({ authenticated: true, isAdmin: true, via: 'session-cookie' })
  })

  it('promotes a non-admin proxy user holding the shared secret to admin', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    process.env.TALONPRESS_SHARED_SECRET = 'machine-token'
    mock.session = proxyUser('Bob Viewer', 'bob@example.com', ['role-viewer'], 'talonpress-admin')

    const { getAccess } = await import('../src/lib/auth/access')
    const access = await getAccess(request({ authorization: 'Bearer machine-token' }))

    // Identity still comes from the proxy; the secret supplies the privilege.
    expect(access).toMatchObject({ via: 'authz', name: 'Bob Viewer', isAdmin: true })
  })

  it('treats header role source as enabled without a proxy URL', async () => {
    process.env.AUTHZ_ROLE_SOURCE = 'header'
    const { config } = await import('../src/lib/config')
    expect(config.authzEnabled).toBe(true)
    expect(config.authEnabled).toBe(true)
    expect(config.sharedSecretEnabled).toBe(false)
  })
})

// TALONPRESS_MCP_AUTH=none exists because MCP clients reach the pod over an
// internal k8s Service — no proxy headers, no shared secret. It must open up
// /api/mcp and nothing else.
describe('config/mcpAuthEnabled', () => {
  beforeEach(() => {
    vi.resetModules()
    mock.session = null
    process.env.PUBLIC_BASE_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    delete process.env.TALONPRESS_SHARED_SECRET
    delete process.env.AUTHZ_PROXY_URL
    delete process.env.TALONPRESS_MCP_AUTH
    delete process.env.PUBLIC_BASE_URL
  })

  it('defaults to inheriting the app-wide gate when authz is configured', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    const { config } = await import('../src/lib/config')
    expect(config.mcpAuthMode).toBe('inherit')
    expect(config.mcpAuthEnabled).toBe(true)
  })

  it('disables MCP auth when set to none, even with authz configured', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    process.env.TALONPRESS_MCP_AUTH = 'none'
    const { config } = await import('../src/lib/config')
    expect(config.mcpAuthEnabled).toBe(false)
    // The dashboard gate is untouched.
    expect(config.authEnabled).toBe(true)
    expect(config.authzEnabled).toBe(true)
  })

  it('disables MCP auth when set to none alongside a shared secret', async () => {
    process.env.TALONPRESS_SHARED_SECRET = 'machine-token'
    process.env.TALONPRESS_MCP_AUTH = 'none'
    const { config } = await import('../src/lib/config')
    expect(config.mcpAuthEnabled).toBe(false)
    expect(config.authEnabled).toBe(true)
  })

  it('treats any unrecognised value as inherit', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    process.env.TALONPRESS_MCP_AUTH = 'off'
    const { config } = await import('../src/lib/config')
    expect(config.mcpAuthMode).toBe('inherit')
    expect(config.mcpAuthEnabled).toBe(true)
  })

  it('stays false when nothing is configured at all', async () => {
    const { config } = await import('../src/lib/config')
    expect(config.mcpAuthEnabled).toBe(false)
    expect(config.authEnabled).toBe(false)
  })

  it('does not leak into getAccess — cleanup stays admin-only', async () => {
    process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'
    process.env.TALONPRESS_MCP_AUTH = 'none'
    const { getAccess } = await import('../src/lib/auth/access')

    // Anonymous: still denied everywhere outside /api/mcp.
    expect(await getAccess(request())).toMatchObject({ authenticated: false, isAdmin: false })

    // Authenticated but not an admin: still no management access.
    mock.session = proxyUser('Bob Viewer', 'bob@example.com', ['role-viewer'], 'talonpress-admin')
    expect(await getAccess(request())).toMatchObject({ authenticated: true, isAdmin: false })
  })
})
