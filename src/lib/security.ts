import crypto from 'crypto'
import path from 'path'

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  try {
    const aBuf = Buffer.from(a)
    const bBuf = Buffer.from(b)
    if (aBuf.length !== bBuf.length) {
      // Prevent length leaks: compare against a dummy to maintain timing
      crypto.timingSafeEqual(aBuf, aBuf)
      return false
    }
    return crypto.timingSafeEqual(aBuf, bBuf)
  } catch {
    return false
  }
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml',
  webmanifest: 'application/manifest+json',
  map: 'application/json',
}

export function getContentType(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

export function computeBuildHash(files: Array<{ path: string; content: string }>): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const hash = crypto.createHash('sha256')
  for (const f of sorted) {
    hash.update(f.path)
    hash.update(f.content)
  }
  return hash.digest('hex')
}
