import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SECRET = 'test-shared-secret'
const AGENT_SECRET = 'test-agent-secret'
const BASE = 'http://localhost:3000'

let tmpDir: string
let fetchSpy: ReturnType<typeof vi.fn>

/** Last outgoing call to OpenTalon: [url, init]. */
function lastCall(): [string, RequestInit] {
  const call = fetchSpy.mock.calls.at(-1)
  if (!call) throw new Error('no outgoing call was made')
  return call as [string, RequestInit]
}

function sentBody(): any {
  return JSON.parse(String(lastCall()[1].body))
}

function agentResponds(body: unknown, status = 200) {
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

async function makeRequest(
  url: string,
  { body, admin = true, origin = BASE }: { body?: unknown; admin?: boolean; origin?: string | null } = {},
) {
  const { NextRequest } = await import('next/server')
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (admin) headers.set('Authorization', `Bearer ${SECRET}`)
  if (origin) headers.set('Origin', origin)
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  })
}

async function seedPackage(name = 'Handbook') {
  const { publishPackage } = await import('../src/lib/storage/deployments')
  return publishPackage(name, 'private', [
    { path: 'index.html', content: '<h1>home</h1>' },
    { path: 'page1.html', content: '<h1>one</h1>' },
  ], 'index.html', { summary: 'The widget handbook' })
}

async function callRoute(
  route: 'session' | 'message' | 'context',
  packageId: string,
  opts: Parameters<typeof makeRequest>[1] = {},
) {
  const mod = await import(`../src/app/api/pub/[packageId]/agent/${route}/route`)
  const req = await makeRequest(`${BASE}/api/pub/${packageId}/agent/${route}`, opts)
  return mod.POST(req, { params: Promise.resolve({ packageId }) })
}

describe('agent proxy routes', () => {
  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talonpress-agent-'))
    process.env.STORAGE_DIR_PATH = tmpDir
    process.env.PUBLIC_BASE_URL = BASE
    process.env.TALONPRESS_SHARED_SECRET = SECRET
    process.env.TALONPRESS_AGENT_URL = 'https://opentalon.example.com'
    process.env.TALONPRESS_AGENT_SECRET = AGENT_SECRET

    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    agentResponds({ chatId: 'embed:talonpress:abc', cursor: 3, history: [], turnId: 't1' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    for (const k of [
      'STORAGE_DIR_PATH', 'PUBLIC_BASE_URL', 'TALONPRESS_SHARED_SECRET',
      'TALONPRESS_AGENT_URL', 'TALONPRESS_AGENT_SECRET', 'AUTHZ_PROXY_URL',
    ]) delete process.env[k]
  })

  describe('fail-closed', () => {
    it('404s and calls nothing when the agent is not configured', async () => {
      delete process.env.TALONPRESS_AGENT_URL
      const pkg = await seedPackage()

      const res = await callRoute('session', pkg.id)
      expect(res.status).toBe(404)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    // The important one: with no auth configured getAccess() reports anonymous
    // callers as admins, so the chat has to stay off rather than trust that.
    it('404s and calls nothing when no auth is configured at all', async () => {
      delete process.env.TALONPRESS_SHARED_SECRET
      const pkg = await seedPackage()

      const { getAccess } = await import('../src/lib/auth/access')
      const { NextRequest } = await import('next/server')
      expect((await getAccess(new NextRequest(BASE))).isAdmin).toBe(true)

      const res = await callRoute('session', pkg.id, { admin: false })
      expect(res.status).toBe(404)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('401s an unauthenticated caller and calls nothing', async () => {
      const pkg = await seedPackage()

      const res = await callRoute('session', pkg.id, { admin: false })
      expect(res.status).toBe(401)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('rejects a cross-origin POST before calling out', async () => {
      const pkg = await seedPackage()

      const res = await callRoute('message', pkg.id, {
        body: { message: 'hi' },
        origin: 'https://evil.example.com',
      })
      expect(res.status).toBe(403)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('404s an unknown package and 503s a disabled one', async () => {
      const pkg = await seedPackage()

      expect((await callRoute('session', 'no-such-package')).status).toBe(404)

      const { disablePackage } = await import('../src/lib/storage/deployments')
      await disablePackage(pkg.id)
      expect((await callRoute('session', pkg.id)).status).toBe(503)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('rejects a page that is not in the package', async () => {
      const pkg = await seedPackage()

      const res = await callRoute('message', pkg.id, {
        body: { message: 'hi', path: '../../etc/passwd' },
      })
      expect(res.status).toBe(400)
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('what reaches OpenTalon', () => {
    it('sends the client header and bearer secret to the embed route', async () => {
      const pkg = await seedPackage()
      await callRoute('session', pkg.id)

      const [url, init] = lastCall()
      expect(url).toBe('https://opentalon.example.com/api/embed/session')
      const headers = init.headers as Record<string, string>
      expect(headers['X-Embed-Client']).toBe('talonpress')
      expect(headers['Authorization']).toBe(`Bearer ${AGENT_SECRET}`)
      expect(init.cache).toBe('no-store')
    })

    it('identifies the package, not the page, as the resource', async () => {
      const pkg = await seedPackage()
      await callRoute('message', pkg.id, { body: { message: 'hi', path: 'page1.html' } })

      const body = sentBody()
      expect(body.resource.id).toBe(pkg.id)
      expect(body.resource.title).toBe('Handbook')
      // The page rides on the URL so navigation does not fork the conversation.
      expect(body.resource.url).toBe(`${BASE}/pub/${pkg.id}/page1.html`)
    })

    it('falls back to the default page when none is given', async () => {
      const pkg = await seedPackage()
      await callRoute('session', pkg.id)

      const body = sentBody()
      expect(body.resource.url).toBe(`${BASE}/pub/${pkg.id}/index.html`)
    })

    it('sends the stored context, rendered', async () => {
      const pkg = await seedPackage()
      await callRoute('session', pkg.id)

      const body = sentBody()
      expect(body.context.summary).toBe('The widget handbook')
      expect(body.context.version).toMatch(/^[0-9a-f]{16}$/)
    })

    // The isolation story: OpenTalon derives the chatId from what we assert here, so
    // a body-supplied actor would let any admin address any conversation.
    it('ignores a caller-supplied actor, resource and chatId', async () => {
      const pkg = await seedPackage()
      await callRoute('message', pkg.id, {
        body: {
          message: 'hi',
          actor: { userKey: 'someone-else', roles: ['superuser'] },
          resource: { id: 'another-package' },
          chatId: 'embed:talonpress:deadbeef',
          context: { summary: 'injected' },
        },
      })

      const body = sentBody()
      expect(body.actor.userKey).not.toBe('someone-else')
      expect(body.resource.id).toBe(pkg.id)
      expect(body.chatId).toBeUndefined()
      expect(body.context.summary).toBe('The widget handbook')
    })

    it('never leaks the agent secret back to the browser', async () => {
      const pkg = await seedPackage()
      const res = await callRoute('session', pkg.id)

      const serialized = JSON.stringify([await res.clone().text(), [...res.headers.entries()]])
      expect(serialized).not.toContain(AGENT_SECRET)
      expect(serialized).not.toContain(SECRET)
    })
  })

  describe('identity', () => {
    it('uses a self-declared name for shared-secret callers', async () => {
      const pkg = await seedPackage()
      await callRoute('session', pkg.id, { body: { identity: 'Ed' } })

      const body = sentBody()
      expect(body.actor.userKey).toBe('talonpress:self:ed')
      expect(body.actor.userLabel).toBe('ed')
    })

    it('falls back to one shared key when no name is given', async () => {
      const pkg = await seedPackage()
      await callRoute('session', pkg.id)

      expect((sentBody() as { actor: { userKey: string } }).actor.userKey)
        .toBe('talonpress:shared-secret')
    })

    it('ignores an invalid claimed name rather than passing it through', async () => {
      const pkg = await seedPackage()
      await callRoute('session', pkg.id, { body: { identity: 'has space/slash' } })

      expect((sentBody() as { actor: { userKey: string } }).actor.userKey)
        .toBe('talonpress:shared-secret')
    })

    it('prefers a real authz identity over anything the caller claims', async () => {
      vi.doMock('@authz-proxy/sdk/next', () => ({
        withAuthzProxy: () => ({
          getSession: async () => ({
            isAuthenticated: true, user: null, username: 'ed@example.com', name: 'Ed Kieffer',
            roles: ['talonpress-admin'], isAdmin: true,
            hasRole: () => true, hasAnyRole: () => true, hasAllRoles: () => true,
            claims: null, raw: null,
          }),
        }),
      }))
      process.env.AUTHZ_PROXY_URL = 'https://authz.example.com'

      const pkg = await seedPackage()
      await callRoute('session', pkg.id, { admin: false, body: { identity: 'someone-else' } })

      const body = sentBody()
      expect(body.actor.userKey).toBe('ed@example.com')
      expect(body.actor.userLabel).toBe('Ed Kieffer')
    })
  })

  describe('responses', () => {
    it('withholds the stream token and expiry from the browser', async () => {
      agentResponds({
        chatId: 'embed:talonpress:abc', cursor: 7, history: [{ role: 'user', text: 'hi' }],
        streamToken: 'super-secret-token', expiresAt: '2030-01-01T00:00:00Z',
        contextVersion: 'v1',
      })
      const pkg = await seedPackage()

      const res = await callRoute('session', pkg.id)
      const json = await res.json()

      expect(json.chatId).toBe('embed:talonpress:abc')
      expect(json.cursor).toBe(7)
      expect(json.history).toHaveLength(1)
      expect(json.streamToken).toBeUndefined()
      expect(json.expiresAt).toBeUndefined()
      expect(JSON.stringify(json)).not.toContain('super-secret-token')
    })

    it('returns 202 for an accepted message', async () => {
      agentResponds({ chatId: 'c', turnId: 'turn-1', cursor: 9 }, 202)
      const pkg = await seedPackage()

      const res = await callRoute('message', pkg.id, { body: { message: 'What is this page?' } })
      expect(res.status).toBe(202)
      expect(await res.json()).toMatchObject({ turnId: 'turn-1', cursor: 9 })
    })

    it('relays a rate limit with its Retry-After', async () => {
      agentResponds({ error: 'slow down', retryAfter: 12 }, 429)
      const pkg = await seedPackage()

      const res = await callRoute('message', pkg.id, { body: { message: 'hi' } })
      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBe('12')
    })

    it('maps upstream failures without relaying their bodies', async () => {
      const pkg = await seedPackage()

      agentResponds({ error: 'internal detail leaked here' }, 500)
      const server = await callRoute('message', pkg.id, { body: { message: 'hi' } })
      expect(server.status).toBe(502)
      expect(await server.text()).not.toContain('internal detail')

      // A rejected chatId is our derivation being wrong, not the caller's fault.
      agentResponds({ error: 'chatId mismatch' }, 403)
      const forbidden = await callRoute('message', pkg.id, { body: { message: 'hi' } })
      expect(forbidden.status).toBe(500)

      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'))
      const down = await callRoute('message', pkg.id, { body: { message: 'hi' } })
      expect(down.status).toBe(502)
    })

    it('rejects an empty or oversized message before calling out', async () => {
      const pkg = await seedPackage()

      expect((await callRoute('message', pkg.id, { body: { message: '' } })).status).toBe(400)
      expect((await callRoute('message', pkg.id, { body: { message: 'x'.repeat(8001) } })).status).toBe(400)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('reports the rendered version from the context route', async () => {
      agentResponds({ ok: true, version: 'server-v2', changed: true })
      const pkg = await seedPackage()

      const res = await callRoute('context', pkg.id, { body: { path: 'page1.html' } })
      expect(await res.json()).toEqual({ ok: true, version: 'server-v2', changed: true })
    })

    // The route renders from storage; a browser-supplied context would let one admin
    // rewrite the prompt prefix every reader of the package shares.
    it('refuses to take a context from the browser', async () => {
      const pkg = await seedPackage()
      await callRoute('context', pkg.id, { body: { context: { summary: 'injected by client' } } })

      const body = sentBody()
      expect(body.context.summary).toBe('The widget handbook')
    })
  })

  describe('SSE relay', () => {
    /** Answer /session with a token, then hand back `streamBody` for /stream. */
    function agentStreams(streamBody: ReadableStream, opts: { token?: string } = {}) {
      fetchSpy.mockImplementation(async (url: string) => {
        if (String(url).includes('/session')) {
          return new Response(
            JSON.stringify({ chatId: 'c', cursor: 0, streamToken: opts.token ?? 'stream-tok' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(streamBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      })
    }

    async function callStream(packageId: string, query = '') {
      const mod = await import('../src/app/api/pub/[packageId]/agent/stream/route')
      const { NextRequest } = await import('next/server')
      const req = new NextRequest(`${BASE}/api/pub/${packageId}/agent/stream${query}`, {
        headers: new Headers({ Authorization: `Bearer ${SECRET}` }),
      })
      return mod.GET(req, { params: Promise.resolve({ packageId }) })
    }

    // The whole point of the route. If anything buffers — Next's fetch cache, gzip,
    // an accidental await on .text() — the first chunk cannot arrive before the
    // upstream stream closes, and a long turn shows nothing until it ends.
    it('delivers the first chunk before the upstream closes', async () => {
      let closeUpstream!: () => void
      const upstreamClosed = new Promise<void>(resolve => { closeUpstream = resolve })
      let closed = false
      void upstreamClosed.then(() => { closed = true })

      agentStreams(new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode('event: status\ndata: {"state":"thinking"}\n\n'))
          await upstreamClosed
          controller.close()
        },
      }))

      const pkg = await seedPackage()
      const res = await callStream(pkg.id)
      expect(res.status).toBe(200)

      const reader = res.body!.getReader()
      const first = await reader.read()

      expect(closed).toBe(false)
      expect(new TextDecoder().decode(first.value)).toContain('event: status')

      closeUpstream()
      await reader.read()
      reader.releaseLock()
    })

    it('sets headers that survive compression and reverse proxies', async () => {
      agentStreams(new ReadableStream({ start: c => c.close() }))
      const pkg = await seedPackage()

      const res = await callStream(pkg.id)

      expect(res.headers.get('content-type')).toContain('text/event-stream')
      expect(res.headers.get('x-accel-buffering')).toBe('no')
      // Asserted against the regex Next's bundled compression middleware actually
      // uses to decide whether to gzip, not a loose substring.
      expect(res.headers.get('cache-control')).toMatch(/(?:^|,)\s*?no-transform\s*?(?:,|$)/)
    })

    it('keeps the stream token server-side', async () => {
      agentStreams(new ReadableStream({ start: c => c.close() }), { token: 'super-secret-token' })
      const pkg = await seedPackage()

      const res = await callStream(pkg.id)
      const serialized = JSON.stringify([...res.headers.entries()])
      expect(serialized).not.toContain('super-secret-token')

      // It reached OpenTalon, just never the browser.
      const streamCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('/stream'))
      expect(String(streamCall![0])).toContain('token=super-secret-token')
    })

    it('ties the upstream connection to the client one', async () => {
      agentStreams(new ReadableStream({ start: c => c.close() }))
      const pkg = await seedPackage()

      const mod = await import('../src/app/api/pub/[packageId]/agent/stream/route')
      const { NextRequest } = await import('next/server')
      const controller = new AbortController()
      const req = new NextRequest(`${BASE}/api/pub/${pkg.id}/agent/stream`, {
        headers: new Headers({ Authorization: `Bearer ${SECRET}` }),
        signal: controller.signal,
      })
      await mod.GET(req, { params: Promise.resolve({ packageId: pkg.id }) })

      const streamCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('/stream'))
      const signal = (streamCall![1] as RequestInit).signal!
      expect(signal.aborted).toBe(false)

      controller.abort()
      expect(signal.aborted).toBe(true)
    })

    it('resumes from Last-Event-ID over the since parameter', async () => {
      agentStreams(new ReadableStream({ start: c => c.close() }))
      const pkg = await seedPackage()

      const mod = await import('../src/app/api/pub/[packageId]/agent/stream/route')
      const { NextRequest } = await import('next/server')
      const req = new NextRequest(`${BASE}/api/pub/${pkg.id}/agent/stream?since=4`, {
        headers: new Headers({ Authorization: `Bearer ${SECRET}`, 'Last-Event-ID': '11' }),
      })
      await mod.GET(req, { params: Promise.resolve({ packageId: pkg.id }) })

      const streamCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('/stream'))
      expect(String(streamCall![0])).toContain('since=11')
    })

    it('gates the stream exactly like the POST routes', async () => {
      agentStreams(new ReadableStream({ start: c => c.close() }))
      const pkg = await seedPackage()

      const mod = await import('../src/app/api/pub/[packageId]/agent/stream/route')
      const { NextRequest } = await import('next/server')
      const anon = new NextRequest(`${BASE}/api/pub/${pkg.id}/agent/stream`)
      const res = await mod.GET(anon, { params: Promise.resolve({ packageId: pkg.id }) })

      expect(res.status).toBe(401)
    })

    it('502s when the session exchange yields no token', async () => {
      agentResponds({ chatId: 'c', cursor: 0 })
      const pkg = await seedPackage()

      const res = await callStream(pkg.id)
      expect(res.status).toBe(502)
    })
  })
})
