import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { PackageMeta } from '../src/lib/storage/types'

// The rendered payload is appended to OpenTalon's prompt-cached system prefix and
// keyed on its version. These tests exist to make a future edit that interpolates a
// clock, a request id or a message fail *here* rather than silently doubling the
// bill in production.

function meta(overrides: Partial<PackageMeta> = {}): PackageMeta {
  return {
    id: 'handbook-abc123',
    name: 'Widget Handbook',
    slug: 'handbook-abc123',
    visibility: 'private',
    defaultPage: 'index.html',
    hash: 'a'.repeat(64),
    files: ['index.html', 'page1.html', 'page2.html'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deleted: false,
    ...overrides,
  }
}

async function load() {
  return import('../src/lib/agent/context')
}

describe('agent/context', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.PUBLIC_BASE_URL = 'https://talonpress.example.com'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete process.env.PUBLIC_BASE_URL
    delete process.env.TALONPRESS_AGENT_MAX_CONTEXT_CHARS
  })

  describe('cacheability', () => {
    it('renders byte-identically as the clock moves', async () => {
      const { renderContextPayload } = await load()
      vi.useFakeTimers()

      const m = meta({ context: { summary: 'A handbook', updatedAt: '2026-01-02T00:00:00.000Z' } })

      vi.setSystemTime(new Date('2026-03-01T09:00:00Z'))
      const first = renderContextPayload(m)

      vi.setSystemTime(new Date('2027-11-14T22:31:07Z'))
      const second = renderContextPayload(m)

      expect(JSON.stringify(second)).toBe(JSON.stringify(first))
      expect(second.version).toBe(first.version)
    })

    it('carries no timestamp other than the stored one', async () => {
      const { renderContextPayload } = await load()
      const stamp = '2026-01-02T03:04:05.000Z'
      const payload = renderContextPayload(meta({ context: { summary: 'x', updatedAt: stamp } }))

      const stamps = JSON.stringify(payload).match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g) ?? []
      expect(stamps).toEqual([stamp.slice(0, 19)])
    })

    it('does not put the current page in the cached payload', async () => {
      const { renderContextPayload } = await load()
      const payload = renderContextPayload(meta())

      // The package root, never a specific page — the reader's location travels on
      // resource.url instead, outside the cached prefix.
      expect(payload.url).toBe('https://talonpress.example.com/pub/handbook-abc123/')
      expect(payload.url).not.toContain('page1.html')
    })

    it('moves the version when a rendered field moves', async () => {
      const { renderContextPayload } = await load()
      const a = renderContextPayload(meta({ context: { summary: 'before' } }))
      const b = renderContextPayload(meta({ context: { summary: 'after' } }))
      expect(b.version).not.toBe(a.version)
    })

    it('holds the version still when only the file hash moves', async () => {
      const { renderContextPayload } = await load()
      const a = renderContextPayload(meta({ context: { summary: 's' }, hash: 'a'.repeat(64) }))
      const b = renderContextPayload(meta({ context: { summary: 's' }, hash: 'b'.repeat(64) }))
      expect(b.version).toBe(a.version)
    })

    it('honours an author-pinned version verbatim', async () => {
      const { renderContextPayload } = await load()
      const payload = renderContextPayload(meta({ context: { summary: 's', version: 'v7' } }))
      expect(payload.version).toBe('v7')
    })

    it('is insensitive to key order in the stored context', async () => {
      const { renderContextPayload, computeContextVersion } = await load()
      const a = renderContextPayload(meta({ context: { summary: 's', facts: { b: '2', a: '1' } } }))
      const b = renderContextPayload(meta({ context: { summary: 's', facts: { a: '1', b: '2' } } }))
      expect(b.version).toBe(a.version)

      const { version: _v, ...rest } = a
      expect(computeContextVersion(rest)).toBe(a.version)
    })
  })

  describe('size cap', () => {
    it('truncates to the budget and flags it', async () => {
      const { renderContextPayload } = await load()
      const payload = renderContextPayload(
        meta({ context: { summary: 'x'.repeat(50_000) } }),
        { maxChars: 500 },
      )

      expect(JSON.stringify(payload).length).toBeLessThanOrEqual(700)
      expect(payload.truncated).toBeTruthy()
      expect(payload.summary?.endsWith('…')).toBe(true)
    })

    it('is deterministic and idempotent', async () => {
      const { renderContextPayload } = await load()
      const m = meta({
        context: {
          summary: 'y'.repeat(9000),
          outline: Array.from({ length: 60 }, (_, i) => `Section ${i}`),
          excerpt: 'z'.repeat(1500),
        },
      })

      const once = renderContextPayload(m, { maxChars: 900 })
      const twice = renderContextPayload(m, { maxChars: 900 })
      expect(JSON.stringify(twice)).toBe(JSON.stringify(once))

      // Feeding the capped result back through changes nothing.
      const again = renderContextPayload(
        meta({ context: { summary: once.summary, outline: once.outline, excerpt: once.excerpt } }),
        { maxChars: 900 },
      )
      expect(again.summary).toBe(once.summary)
      expect(again.outline).toEqual(once.outline)
    })

    it('drops the excerpt before trimming the outline', async () => {
      const { renderContextPayload } = await load()
      const m = meta({
        context: {
          summary: 'short',
          outline: ['One', 'Two', 'Three'],
          excerpt: 'q'.repeat(2000),
        },
      })

      const payload = renderContextPayload(m, { maxChars: 400 })
      expect(payload.excerpt).toBeUndefined()
      expect(payload.outline).toEqual(['One', 'Two', 'Three'])
      expect(payload.summary).toBe('short')
    })

    it('trims the outline before cutting the summary', async () => {
      const { renderContextPayload } = await load()
      const m = meta({
        context: {
          summary: 'keep me whole',
          outline: Array.from({ length: 40 }, (_, i) => `Section number ${i}`),
        },
      })

      const payload = renderContextPayload(m, { maxChars: 400 })
      expect((payload.outline ?? []).length).toBeLessThan(40)
      expect(payload.summary).toBe('keep me whole')
    })

    it('reads the budget from config by default', async () => {
      process.env.TALONPRESS_AGENT_MAX_CONTEXT_CHARS = '300'
      const { renderContextPayload } = await load()
      const payload = renderContextPayload(meta({ context: { summary: 'w'.repeat(5000) } }))
      expect(payload.truncated).toBeTruthy()
      expect(JSON.stringify(payload).length).toBeLessThan(700)
    })
  })

  describe('fallbacks', () => {
    it('derives a structural context when none is stored', async () => {
      const { renderContextPayload } = await load()
      const payload = renderContextPayload(meta())

      expect(payload.title).toBe('Widget Handbook')
      expect(payload.outline).toEqual(['index.html', 'page1.html', 'page2.html'])
      expect(payload.facts).toMatchObject({ fileCount: 3, defaultPage: 'index.html' })
      expect(payload.summary).toBeUndefined()
    })

    it('discards an unreadable stored context instead of throwing', async () => {
      const { renderContextPayload } = await load()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const payload = renderContextPayload(meta({ context: { summary: 42 } as never }))

      expect(payload.outline).toEqual(['index.html', 'page1.html', 'page2.html'])
      expect(payload.summary).toBeUndefined()
      expect(warn).toHaveBeenCalledOnce()
    })

    it('reflects the package name and visibility, not stored copies of them', async () => {
      const { renderContextPayload } = await load()
      const payload = renderContextPayload(
        meta({ name: 'Renamed', visibility: 'public', context: { summary: 's' } }),
      )
      expect(payload.title).toBe('Renamed')
      expect(payload.visibility).toBe('public')
    })
  })
})
