import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('auth/session', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.TALONPRESS_SHARED_SECRET = 'test-secret-abc'
    process.env.AUTH_SESSION_TTL = '3600'
    process.env.PUBLIC_BASE_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    vi.resetModules()
    delete process.env.TALONPRESS_SHARED_SECRET
    delete process.env.AUTH_SESSION_TTL
    delete process.env.PUBLIC_BASE_URL
  })

  it('creates a verifiable session cookie', async () => {
    const { createSessionCookie, verifySession } = await import('../src/lib/auth/session')

    const cookieHeader = createSessionCookie()
    // Extract the value from "tp_session=<value>; ..."
    const match = cookieHeader.match(/tp_session=([^;]+)/)
    expect(match).toBeTruthy()

    const cookieValue = `tp_session=${match![1]}`
    expect(verifySession(cookieValue)).toBe(true)
  })

  it('rejects a tampered session cookie', async () => {
    const { createSessionCookie, verifySession } = await import('../src/lib/auth/session')

    const cookieHeader = createSessionCookie()
    const tampered = cookieHeader.replace(/([A-Za-z0-9])(?=;)/, 'X')
    const match = tampered.match(/tp_session=([^;]+)/)
    expect(match).toBeTruthy()

    expect(verifySession(`tp_session=${match![1]}`)).toBe(false)
  })

  it('rejects a missing/null cookie', async () => {
    const { verifySession } = await import('../src/lib/auth/session')
    expect(verifySession(null)).toBe(false)
    expect(verifySession('')).toBe(false)
  })

  // The "no auth configured means open" rule lives in getAccess() now, so that an
  // authz-proxy-only deployment isn't waved through by the absent shared secret.
  it('rejects sessions when no shared secret is configured', async () => {
    delete process.env.TALONPRESS_SHARED_SECRET
    const { verifySession } = await import('../src/lib/auth/session')
    expect(verifySession(null)).toBe(false)
  })

  it('does not accept cookies signed with an empty secret', async () => {
    const { createSessionCookie } = await import('../src/lib/auth/session')
    const cookieHeader = createSessionCookie()
    const value = cookieHeader.match(/tp_session=([^;]+)/)![1]

    vi.resetModules()
    delete process.env.TALONPRESS_SHARED_SECRET
    const { verifySession } = await import('../src/lib/auth/session')
    expect(verifySession(`tp_session=${value}`)).toBe(false)
  })
})

describe('auth/secret', () => {
  it('timingSafeCompare returns true for equal strings', async () => {
    const { timingSafeCompare } = await import('../src/lib/auth/secret')
    expect(timingSafeCompare('hello', 'hello')).toBe(true)
  })

  it('timingSafeCompare returns false for unequal strings', async () => {
    const { timingSafeCompare } = await import('../src/lib/auth/secret')
    expect(timingSafeCompare('hello', 'world')).toBe(false)
  })

  it('timingSafeCompare handles empty strings', async () => {
    const { timingSafeCompare } = await import('../src/lib/auth/secret')
    expect(timingSafeCompare('', '')).toBe(false)
    expect(timingSafeCompare('x', '')).toBe(false)
  })
})
