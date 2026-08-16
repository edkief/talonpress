import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Drives the context tools through registerTools() with a stub server, so the tool
// names, schemas and handlers are exercised the way an MCP client would reach them
// rather than by calling the storage layer directly.

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>
  isError?: boolean
}>

let tmpDir: string

async function loadTools(): Promise<Map<string, Handler>> {
  const { registerTools } = await import('../src/lib/mcp/tools')
  const registered = new Map<string, Handler>()
  const stub = {
    registerTool(name: string, _spec: unknown, handler: Handler) {
      registered.set(name, handler)
    },
  }
  registerTools(stub as never)
  return registered
}

function payload(res: { content: Array<{ text: string }> }): any {
  return JSON.parse(res.content[0].text)
}

describe('mcp context tools', () => {
  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talonpress-mcp-'))
    process.env.STORAGE_DIR_PATH = tmpDir
    process.env.PUBLIC_BASE_URL = 'https://talonpress.example.com'
  })

  afterEach(() => {
    vi.resetModules()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.STORAGE_DIR_PATH
    delete process.env.PUBLIC_BASE_URL
  })

  it('registers the context tools', async () => {
    const tools = await loadTools()
    expect(tools.has('set_package_context')).toBe(true)
    expect(tools.has('get_package_context')).toBe(true)
  })

  it('publishes with a context and reads it back', async () => {
    const tools = await loadTools()

    const published = payload(await tools.get('publish_package')!({
      name: 'Handbook',
      visibility: 'public',
      files: [{ path: 'index.html', content: '<h1>hi</h1>' }],
      default_page: 'index.html',
      context: { summary: 'The widget handbook', outline: ['Intro'] },
    }))

    const got = payload(await tools.get('get_package_context')!({ package_id: published.id }))
    expect(got.stored).toMatchObject({ summary: 'The widget handbook', outline: ['Intro'] })
    expect(got.derived).toBe(false)
    expect(got.rendered).toMatchObject({ title: 'Handbook', summary: 'The widget handbook' })
    expect(got.version).toBe(got.rendered.version)
  })

  it('derives a context for a package that never had one', async () => {
    const tools = await loadTools()

    const published = payload(await tools.get('publish_package')!({
      name: 'Bare',
      visibility: 'public',
      files: [{ path: 'index.html', content: 'x' }],
      default_page: 'index.html',
    }))

    const got = payload(await tools.get('get_package_context')!({ package_id: published.id }))
    expect(got.stored).toBeNull()
    expect(got.derived).toBe(true)
    expect(got.rendered.outline).toEqual(['index.html'])
  })

  it('sets, reports a version, and clears', async () => {
    const tools = await loadTools()

    const published = payload(await tools.get('publish_package')!({
      name: 'Settable',
      visibility: 'public',
      files: [{ path: 'index.html', content: 'x' }],
      default_page: 'index.html',
    }))

    const set = payload(await tools.get('set_package_context')!({
      package_id: published.id,
      context: { summary: 'Now described' },
    }))
    expect(set.version).toMatch(/^[0-9a-f]{16}$/)
    expect(set.truncated).toBe(false)
    expect(set.char_count).toBeGreaterThan(0)

    const cleared = payload(await tools.get('set_package_context')!({
      package_id: published.id,
      clear: true,
    }))
    expect(cleared.cleared).toBe(true)

    const got = payload(await tools.get('get_package_context')!({ package_id: published.id }))
    expect(got.stored).toBeNull()
  })

  it('flags truncation rather than hiding it', async () => {
    process.env.TALONPRESS_AGENT_MAX_CONTEXT_CHARS = '200'
    const tools = await loadTools()

    const published = payload(await tools.get('publish_package')!({
      name: 'Big',
      visibility: 'public',
      files: [{ path: 'index.html', content: 'x' }],
      default_page: 'index.html',
    }))

    const set = payload(await tools.get('set_package_context')!({
      package_id: published.id,
      context: { summary: 'y'.repeat(1800) },
    }))
    expect(set.truncated).toBe(true)
    delete process.env.TALONPRESS_AGENT_MAX_CONTEXT_CHARS
  })

  it('returns an error result rather than throwing on a bad context', async () => {
    const tools = await loadTools()

    const published = payload(await tools.get('publish_package')!({
      name: 'Bad Ctx',
      visibility: 'public',
      files: [{ path: 'index.html', content: 'x' }],
      default_page: 'index.html',
    }))

    const res = await tools.get('set_package_context')!({
      package_id: published.id,
      context: { summary: 'x'.repeat(5000) },
    })
    expect(res.isError).toBe(true)
    expect(payload(res).error).toMatch(/Invalid package context/)

    const missing = await tools.get('set_package_context')!({ package_id: published.id })
    expect(missing.isError).toBe(true)
    expect(payload(missing).error).toMatch(/clear=true/)
  })

  // publish_package was the one tool with no try/catch; a thrown validation error
  // used to propagate out of the handler instead of becoming a tool error result.
  it('reports publish failures as an error result', async () => {
    const tools = await loadTools()

    const res = await tools.get('publish_package')!({
      name: 'Bad Page',
      visibility: 'public',
      files: [{ path: 'index.html', content: 'x' }],
      default_page: 'nope.html',
    })
    expect(res.isError).toBe(true)
    expect(payload(res).error).toMatch(/does not exist/)
  })

  it('carries a session context through begin and finalize', async () => {
    const tools = await loadTools()

    const begun = payload(await tools.get('begin_publish_session')!({
      mode: 'create',
      name: 'Streamed',
      visibility: 'public',
      default_page: 'index.html',
      context: { summary: 'From begin' },
    }))
    await tools.get('upload_session_files')!({
      session_id: begun.session_id,
      files: [{ path: 'index.html', content: 'x' }],
    })
    const finalized = payload(await tools.get('finalize_publish_session')!({
      session_id: begun.session_id,
    }))

    const got = payload(await tools.get('get_package_context')!({ package_id: finalized.id }))
    expect(got.stored).toMatchObject({ summary: 'From begin' })
  })
})
