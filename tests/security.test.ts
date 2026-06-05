import { describe, it, expect } from 'vitest'
import path from 'path'

describe('security', () => {
  describe('timingSafeCompare', () => {
    it('returns true for matching strings', async () => {
      const { timingSafeCompare } = await import('../src/lib/security')
      expect(timingSafeCompare('abc', 'abc')).toBe(true)
    })

    it('returns false for mismatched strings', async () => {
      const { timingSafeCompare } = await import('../src/lib/security')
      expect(timingSafeCompare('abc', 'xyz')).toBe(false)
    })

    it('returns false for empty inputs', async () => {
      const { timingSafeCompare } = await import('../src/lib/security')
      expect(timingSafeCompare('', 'abc')).toBe(false)
      expect(timingSafeCompare('abc', '')).toBe(false)
    })
  })

  describe('generateToken', () => {
    it('returns a 64-char hex string', async () => {
      const { generateToken } = await import('../src/lib/security')
      const token = generateToken()
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('generates unique tokens', async () => {
      const { generateToken } = await import('../src/lib/security')
      expect(generateToken()).not.toBe(generateToken())
    })
  })

  describe('getContentType', () => {
    it('maps common extensions', async () => {
      const { getContentType } = await import('../src/lib/security')
      expect(getContentType('file.html')).toContain('text/html')
      expect(getContentType('file.css')).toContain('text/css')
      expect(getContentType('file.js')).toContain('application/javascript')
      expect(getContentType('file.json')).toContain('application/json')
      expect(getContentType('file.png')).toBe('image/png')
      expect(getContentType('file.svg')).toContain('image/svg+xml')
    })

    it('falls back to octet-stream for unknown', async () => {
      const { getContentType } = await import('../src/lib/security')
      expect(getContentType('file.unknown')).toBe('application/octet-stream')
    })
  })

  describe('resolveSafeFilePath (paths.ts)', () => {
    it('resolves a valid path', async () => {
      const { resolveSafeFilePath } = await import('../src/lib/storage/paths')
      const result = resolveSafeFilePath('my-pkg-abc123', ['index.html'])
      expect(result).toBeTruthy()
      expect(result!).toContain('my-pkg-abc123')
      expect(result!).toContain('index.html')
    })

    it('blocks path traversal with ..', async () => {
      const { resolveSafeFilePath } = await import('../src/lib/storage/paths')
      const result = resolveSafeFilePath('my-pkg-abc123', ['..', '..', 'etc', 'passwd'])
      expect(result).toBeNull()
    })

    it('blocks absolute paths embedded in segments', async () => {
      const { resolveSafeFilePath } = await import('../src/lib/storage/paths')
      // path.resolve will collapse /etc/passwd — result should be outside dist
      const result = resolveSafeFilePath('my-pkg-abc123', ['/etc/passwd'])
      // Either null or stays within dist; it should NOT reach /etc/passwd
      if (result !== null) {
        const { distDir } = await import('../src/lib/storage/paths')
        expect(result.startsWith(distDir('my-pkg-abc123'))).toBe(true)
      }
    })

    it('defaults to index.html for empty segments', async () => {
      const { resolveSafeFilePath } = await import('../src/lib/storage/paths')
      const result = resolveSafeFilePath('my-pkg-abc123', [])
      expect(result).toContain('index.html')
    })
  })
})
