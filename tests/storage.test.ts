import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Override STORAGE_DIR_PATH before importing modules
let tmpDir: string

// We need to test with a temp dir. Use dynamic imports + env override.
describe('storage/deployments', () => {
  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talonpress-test-'))
    process.env.STORAGE_DIR_PATH = tmpDir
  })

  afterEach(() => {
    vi.resetModules()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.STORAGE_DIR_PATH
  })

  it('publish and get round-trip', async () => {
    // Dynamic import so config is re-evaluated with new env
    const { publishPackage, getPackageMeta } = await import('../src/lib/storage/deployments')

    const meta = await publishPackage('Test Site', 'public', [
      { path: 'index.html', content: '<h1>Hello</h1>' },
      { path: 'styles.css', content: 'body { color: red; }' },
    ], 'index.html')

    expect(meta.name).toBe('Test Site')
    expect(meta.visibility).toBe('public')
    expect(meta.secure_token).toBeUndefined()
    expect(meta.files).toEqual(expect.arrayContaining(['index.html', 'styles.css']))
    expect(meta.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(meta.deleted).toBe(false)

    const fetched = await getPackageMeta(meta.id)
    expect(fetched?.id).toBe(meta.id)
    expect(fetched?.name).toBe('Test Site')
  })

  it('private package gets a secure_token', async () => {
    const { publishPackage } = await import('../src/lib/storage/deployments')

    const meta = await publishPackage('Private App', 'private', [
      { path: 'index.html', content: '<h1>Secret</h1>' },
    ])

    expect(meta.visibility).toBe('private')
    expect(meta.secure_token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('update overlays matching files, keeps others', async () => {
    const { publishPackage, updatePackage, getPackageMeta } = await import('../src/lib/storage/deployments')

    const meta = await publishPackage('My App', 'public', [
      { path: 'index.html', content: '<h1>v1</h1>' },
      { path: 'style.css', content: 'body{}' },
    ], 'index.html')

    await updatePackage(meta.id, [
      { path: 'index.html', content: '<h1>v2</h1>' },
      { path: 'extra.js', content: 'console.log(1)' },
    ])

    // Read the files from disk to verify
    const { distDir } = await import('../src/lib/storage/paths')
    const indexContent = fs.readFileSync(path.join(distDir(meta.id), 'index.html'), 'utf8')
    const cssContent = fs.readFileSync(path.join(distDir(meta.id), 'style.css'), 'utf8')
    const jsContent = fs.readFileSync(path.join(distDir(meta.id), 'extra.js'), 'utf8')

    expect(indexContent).toBe('<h1>v2</h1>')
    expect(cssContent).toBe('body{}')
    expect(jsContent).toBe('console.log(1)')

    const updated = await getPackageMeta(meta.id)
    expect(updated?.files).toEqual(expect.arrayContaining(['index.html', 'style.css', 'extra.js']))
  })

  it('delete removes the directory and marks deleted in registry', async () => {
    const { publishPackage, deletePackage, getPackageMeta } = await import('../src/lib/storage/deployments')
    const { deploymentDir } = await import('../src/lib/storage/paths')

    const meta = await publishPackage('To Delete', 'public', [
      { path: 'index.html', content: '...' },
    ])

    const dirPath = deploymentDir(meta.id)
    expect(fs.existsSync(dirPath)).toBe(true)

    await deletePackage(meta.id)

    expect(fs.existsSync(dirPath)).toBe(false)
    const fetched = await getPackageMeta(meta.id)
    expect(fetched).toBeNull()
  })

  it('update_visibility to private generates new token', async () => {
    const { publishPackage, updateVisibility } = await import('../src/lib/storage/deployments')

    const meta = await publishPackage('Vis Test', 'public', [
      { path: 'index.html', content: '...' },
    ])
    expect(meta.secure_token).toBeUndefined()

    const updated = await updateVisibility(meta.id, 'private')
    expect(updated.visibility).toBe('private')
    expect(updated.secure_token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('update_visibility to public clears token', async () => {
    const { publishPackage, updateVisibility } = await import('../src/lib/storage/deployments')

    const meta = await publishPackage('Vis Test 2', 'private', [
      { path: 'index.html', content: '...' },
    ])
    expect(meta.secure_token).toBeDefined()

    const updated = await updateVisibility(meta.id, 'public')
    expect(updated.visibility).toBe('public')
    expect(updated.secure_token).toBeUndefined()
  })

  it('atomic write: no partial deployment on disk', async () => {
    const { publishPackage } = await import('../src/lib/storage/deployments')
    const { deploymentsDir } = await import('../src/lib/storage/paths')

    await publishPackage('Atomic Test', 'public', [
      { path: 'a.html', content: 'aaa' },
    ])

    // No .tmp-* dirs should remain
    const entries = fs.readdirSync(deploymentsDir())
    const tmps = entries.filter(e => e.startsWith('.tmp-'))
    expect(tmps).toHaveLength(0)
  })

  it('session create: chunked upload then finalize publishes, hash matches single-call', async () => {
    const { publishPackage, beginPublishSession, uploadSessionFiles, finalizePublishSession, getPackageMeta } =
      await import('../src/lib/storage/deployments')
    const { distDir } = await import('../src/lib/storage/paths')

    const files = [
      { path: 'index.html', content: '<h1>Streamed</h1>' },
      { path: 'a.css', content: 'body{}' },
      { path: 'img.bin', content: Buffer.from([0, 1, 2, 3]).toString('base64'), encoding: 'base64' as const },
    ]

    const { sessionId } = await beginPublishSession({
      mode: 'create',
      name: 'Streamed Site',
      visibility: 'public',
      defaultPage: 'index.html',
    })
    // Upload across separate calls, like the client streams chunks.
    await uploadSessionFiles(sessionId, [files[0]])
    await uploadSessionFiles(sessionId, [files[1], files[2]])
    const meta = await finalizePublishSession(sessionId)

    expect(meta.defaultPage).toBe('index.html')
    expect(meta.files).toEqual(expect.arrayContaining(['index.html', 'a.css', 'img.bin']))
    expect(fs.readFileSync(path.join(distDir(meta.id), 'index.html'), 'utf8')).toBe('<h1>Streamed</h1>')
    expect([...fs.readFileSync(path.join(distDir(meta.id), 'img.bin'))]).toEqual([0, 1, 2, 3])

    // Streamed hash must equal a one-shot publish of the same bytes.
    const single = await publishPackage('Single Site', 'public', files, 'index.html')
    expect(meta.hash).toBe(single.hash)

    // Session dir is consumed, none left behind.
    const fetched = await getPackageMeta(meta.id)
    expect(fetched?.hash).toBe(meta.hash)
  })

  it('session update: seeds existing files, overlays uploaded chunk', async () => {
    const { publishPackage, beginPublishSession, uploadSessionFiles, finalizePublishSession } =
      await import('../src/lib/storage/deployments')
    const { distDir } = await import('../src/lib/storage/paths')

    const base = await publishPackage('Upd Site', 'public', [
      { path: 'index.html', content: '<h1>v1</h1>' },
      { path: 'keep.css', content: 'body{}' },
    ], 'index.html')

    const { sessionId } = await beginPublishSession({ mode: 'update', packageId: base.id })
    await uploadSessionFiles(sessionId, [
      { path: 'index.html', content: '<h1>v2</h1>' },
      { path: 'new.js', content: 'x' },
    ])
    const updated = await finalizePublishSession(sessionId)

    expect(fs.readFileSync(path.join(distDir(base.id), 'index.html'), 'utf8')).toBe('<h1>v2</h1>')
    expect(fs.readFileSync(path.join(distDir(base.id), 'keep.css'), 'utf8')).toBe('body{}')
    expect(fs.readFileSync(path.join(distDir(base.id), 'new.js'), 'utf8')).toBe('x')
    expect(updated.files).toEqual(expect.arrayContaining(['index.html', 'keep.css', 'new.js']))
  })

  it('session upload rejects path traversal', async () => {
    const { beginPublishSession, uploadSessionFiles } = await import('../src/lib/storage/deployments')

    const { sessionId } = await beginPublishSession({
      mode: 'create',
      name: 'Evil',
      visibility: 'public',
      defaultPage: 'index.html',
    })
    await expect(
      uploadSessionFiles(sessionId, [{ path: '../escape.txt', content: 'pwn' }]),
    ).rejects.toThrow(/Illegal file path/)
  })

  it('list_packages filters by visibility', async () => {
    const { publishPackage, listPackages } = await import('../src/lib/storage/deployments')

    await publishPackage('Pub One', 'public', [{ path: 'i.html', content: '' }], 'i.html')
    await publishPackage('Priv One', 'private', [{ path: 'i.html', content: '' }], 'i.html')
    await publishPackage('Pub Two', 'public', [{ path: 'i.html', content: '' }], 'i.html')

    const all = await listPackages()
    expect(all).toHaveLength(3)

    const pubs = await listPackages('public')
    expect(pubs).toHaveLength(2)

    const privs = await listPackages('private')
    expect(privs).toHaveLength(1)
  })

  it('list_packages respects limit', async () => {
    const { publishPackage, listPackages } = await import('../src/lib/storage/deployments')

    await publishPackage('A', 'public', [{ path: 'i.html', content: '' }], 'i.html')
    await publishPackage('B', 'public', [{ path: 'i.html', content: '' }], 'i.html')
    await publishPackage('C', 'public', [{ path: 'i.html', content: '' }], 'i.html')

    const limited = await listPackages(undefined, 2)
    expect(limited).toHaveLength(2)
  })

  it('deleteOldPackages removes only packages older than the threshold', async () => {
    const { publishPackage, deleteOldPackages, getPackageMeta, listPackages } =
      await import('../src/lib/storage/deployments')

    const fresh = await publishPackage('Fresh', 'public', [{ path: 'i.html', content: '' }], 'i.html')
    const stale = await publishPackage('Stale', 'public', [{ path: 'i.html', content: '' }], 'i.html')

    // Backdate the stale package's updatedAt to 40 days ago.
    const { metaPath } = await import('../src/lib/storage/paths')
    const raw = JSON.parse(fs.readFileSync(metaPath(stale.id), 'utf8'))
    raw.updatedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
    fs.writeFileSync(metaPath(stale.id), JSON.stringify(raw))

    const { deleted } = await deleteOldPackages(30)

    expect(deleted).toEqual([stale.id])
    expect(await getPackageMeta(stale.id)).toBeNull()
    expect(await getPackageMeta(fresh.id)).not.toBeNull()
    expect(await listPackages()).toHaveLength(1)
  })
})
