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
    ])

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
    ])

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

  it('list_packages filters by visibility', async () => {
    const { publishPackage, listPackages } = await import('../src/lib/storage/deployments')

    await publishPackage('Pub One', 'public', [{ path: 'i.html', content: '' }])
    await publishPackage('Priv One', 'private', [{ path: 'i.html', content: '' }])
    await publishPackage('Pub Two', 'public', [{ path: 'i.html', content: '' }])

    const all = await listPackages()
    expect(all).toHaveLength(3)

    const pubs = await listPackages('public')
    expect(pubs).toHaveLength(2)

    const privs = await listPackages('private')
    expect(privs).toHaveLength(1)
  })

  it('list_packages respects limit', async () => {
    const { publishPackage, listPackages } = await import('../src/lib/storage/deployments')

    await publishPackage('A', 'public', [{ path: 'i.html', content: '' }])
    await publishPackage('B', 'public', [{ path: 'i.html', content: '' }])
    await publishPackage('C', 'public', [{ path: 'i.html', content: '' }])

    const limited = await listPackages(undefined, 2)
    expect(limited).toHaveLength(2)
  })
})
