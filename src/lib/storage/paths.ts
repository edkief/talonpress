import path from 'path'
import crypto from 'crypto'
import { config } from '../config'

export function storageRoot(): string {
  return config.storageDirPath
}

export function deploymentsDir(): string {
  return path.join(storageRoot(), 'deployments')
}

export function registryPath(): string {
  return path.join(storageRoot(), 'registry.jsonl')
}

export function deploymentDir(id: string): string {
  return path.join(deploymentsDir(), id)
}

export function metaPath(id: string): string {
  return path.join(deploymentDir(id), 'meta.json')
}

export function distDir(id: string): string {
  return path.join(deploymentDir(id), 'dist')
}

export function tmpDir(): string {
  const rand = crypto.randomBytes(4).toString('hex')
  return path.join(deploymentsDir(), `.tmp-${rand}`)
}

export function sessionsDir(): string {
  return path.join(storageRoot(), 'sessions')
}

// Session ids are validated to be hex-only before reaching the filesystem.
export function sessionDir(sessionId: string): string {
  return path.join(sessionsDir(), sessionId)
}

export function generateSessionId(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'package'
}

export function generateId(name: string): string {
  const slug = slugify(name)
  // Always include random suffix to prevent brute-force enumeration
  const rand = crypto.randomBytes(3).toString('hex')
  return `${slug}-${rand}`
}

/**
 * Resolves a requested file path safely within a package's dist directory.
 * Returns null if the path would escape the dist directory.
 */
export function resolveSafeFilePath(
  packageId: string,
  segments: string[],
  defaultPage = 'index.html',
): string | null {
  const base = distDir(packageId)
  const requested = segments.length === 0 ? defaultPage : segments.join('/')

  const resolved = path.resolve(base, requested)

  // Must stay within base
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return null
  }

  return resolved
}
