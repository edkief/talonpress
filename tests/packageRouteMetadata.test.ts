import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'

let storageDir: string

describe('package link-preview metadata', () => {
  beforeEach(() => {
    vi.resetModules()
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talonpress-route-test-'))
    process.env.STORAGE_DIR_PATH = storageDir
    process.env.PUBLIC_BASE_URL = 'http://localhost:3000'
    delete process.env.TALONPRESS_SHARED_SECRET
    delete process.env.AUTHZ_PROXY_URL
    delete process.env.AUTHZ_ROLE_SOURCE
  })

  afterEach(() => {
    vi.resetModules()
    fs.rmSync(storageDir, { recursive: true, force: true })
    delete process.env.STORAGE_DIR_PATH
    delete process.env.PUBLIC_BASE_URL
  })

  it('always exposes the package title for public HTML', async () => {
    const { publishPackage } = await import('../src/lib/storage/deployments')
    const meta = await publishPackage(
      'Public & Useful',
      'public',
      [{ path: 'index.html', content: '<html><head></head><body>Public page</body></html>' }],
    )

    const response = await getPackage(meta.id, ['index.html'])
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<meta property="og:title" content="Public &amp; Useful">')
    expect(html).toContain('<meta name="twitter:title" content="Public &amp; Useful">')
  })

  it('only exposes a private package title with its valid query token', async () => {
    const { publishPackage } = await import('../src/lib/storage/deployments')
    const meta = await publishPackage(
      'Private plans',
      'private',
      [{ path: 'index.html', content: '<html><head></head><body>Secret page</body></html>' }],
    )

    const unauthorized = await getPackage(meta.id, ['index.html'])
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.text()).not.toContain('Private plans')

    const wrongToken = await getPackage(meta.id, ['index.html'], '?token=wrong')
    expect(wrongToken.status).toBe(401)
    expect(await wrongToken.text()).not.toContain('Private plans')

    const authorized = await getPackage(meta.id, ['index.html'], `?token=${meta.secure_token}`)
    expect(authorized.status).toBe(200)
    expect(await authorized.text()).toContain('<meta property="og:title" content="Private plans">')
  })

  it('does not expose a private title on a tokenless package-session request', async () => {
    const { publishPackage } = await import('../src/lib/storage/deployments')
    const meta = await publishPackage(
      'Cookie-only secret',
      'private',
      [{ path: 'index.html', content: '<html><head></head><body>Secret page</body></html>' }],
    )

    const tokenResponse = await getPackage(meta.id, ['index.html'], `?token=${meta.secure_token}`)
    const cookie = tokenResponse.headers.get('set-cookie')!.split(';', 1)[0]
    const sessionResponse = await getPackage(meta.id, ['index.html'], '', { cookie })
    const html = await sessionResponse.text()

    expect(sessionResponse.status).toBe(200)
    expect(html).not.toContain('property="og:title"')
    expect(html).not.toContain('name="twitter:title"')
  })

  it('preserves a private token while adding the package-root trailing slash', async () => {
    const { publishPackage } = await import('../src/lib/storage/deployments')
    const meta = await publishPackage(
      'Redirected secret',
      'private',
      [{ path: 'index.html', content: '<html><body>Secret page</body></html>' }],
    )

    const response = await getPackage(meta.id, undefined, `?token=${meta.secure_token}`)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      `http://localhost:3000/pub/${meta.id}/?token=${meta.secure_token}`,
    )
  })
})

async function getPackage(
  packageId: string,
  pathSegments?: string[],
  search = '',
  headers?: HeadersInit,
): Promise<Response> {
  const { GET } = await import('../src/app/pub/[packageId]/[[...path]]/route')
  const request = new NextRequest(`http://localhost:3000/pub/${packageId}${pathSegments ? `/${pathSegments.join('/')}` : ''}${search}`, {
    headers,
  })
  return GET(request, { params: Promise.resolve({ packageId, path: pathSegments }) })
}
