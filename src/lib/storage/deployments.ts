import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import {
  generateId,
  deploymentsDir,
  deploymentDir,
  metaPath,
  distDir,
  tmpDir,
  sessionsDir,
  sessionDir,
  generateSessionId,
} from './paths'
import { appendRegistryEvent } from './registry'
import type { FileInput, PackageMeta, Visibility } from './types'

// --- Utilities ---

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

function computeHash(files: FileInput[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const hash = crypto.createHash('sha256')
  for (const f of sorted) {
    hash.update(f.path)
    hash.update(f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : f.content)
  }
  return hash.digest('hex')
}

// Resolve `rel` under `base`, rejecting anything that escapes the directory.
function safeJoin(base: string, rel: string): string {
  const resolved = path.resolve(base, rel)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Illegal file path: ${rel}`)
  }
  return resolved
}

async function writeFiles(baseDir: string, files: FileInput[]): Promise<void> {
  for (const file of files) {
    const filePath = safeJoin(baseDir, file.path)
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    if (file.encoding === 'base64') {
      await fs.promises.writeFile(filePath, Buffer.from(file.content, 'base64'))
    } else {
      await fs.promises.writeFile(filePath, file.content, 'utf8')
    }
  }
}

// Hash a dist directory by streaming each file through sha256 — never holds a
// whole file (let alone the whole package) in memory. Path-then-content order
// and localeCompare sort match the in-memory computeHash() above, so a package
// published via session hashes identically to one published in a single call.
async function hashDir(dir: string): Promise<string> {
  const files = (await listFilesRecursive(dir)).sort((a, b) => a.localeCompare(b))
  const hash = crypto.createHash('sha256')
  for (const rel of files) {
    hash.update(rel.split(path.sep).join('/'))
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(path.join(dir, rel))
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })
  }
  return hash.digest('hex')
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true })
  const entries = await fs.promises.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await fs.promises.copyFile(srcPath, destPath)
    }
  }
}

async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
  const results: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(full, base))
    } else {
      results.push(path.relative(base, full))
    }
  }
  return results
}

// --- Ensure storage dirs ---

async function ensureDirs(): Promise<void> {
  await fs.promises.mkdir(deploymentsDir(), { recursive: true })
}

// --- Public API ---

export async function publishPackage(
  name: string,
  visibility: Visibility,
  files: FileInput[],
  defaultPage?: string,
): Promise<PackageMeta> {
  await ensureDirs()

  const filePaths = files.map(f => f.path)
  const effectivePage = defaultPage ?? (files.length === 1 ? files[0].path : undefined)
  if (!effectivePage) {
    throw new Error('defaultPage is required when publishing multiple files')
  }
  if (!filePaths.includes(effectivePage)) {
    throw new Error(`defaultPage "${effectivePage}" does not exist in the package files`)
  }

  const id = generateId(name)
  const slug = id
  const hash = computeHash(files)
  const now = new Date().toISOString()
  const secure_token = visibility === 'private' ? generateToken() : undefined

  const meta: PackageMeta = {
    id,
    name,
    slug,
    visibility,
    ...(secure_token ? { secure_token } : {}),
    defaultPage: effectivePage,
    hash,
    files: filePaths,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }

  // Write to temp dir first, then rename atomically
  const tmp = tmpDir()
  const tmpDist = path.join(tmp, 'dist')
  await fs.promises.mkdir(tmpDist, { recursive: true })
  await writeFiles(tmpDist, files)
  await fs.promises.writeFile(path.join(tmp, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

  const final = deploymentDir(id)
  await fs.promises.rename(tmp, final)

  await appendRegistryEvent({
    ts: now,
    event: 'publish',
    id,
    visibility,
    hash,
  })

  return meta
}

export async function getPackageMeta(id: string): Promise<PackageMeta | null> {
  const mPath = metaPath(id)
  try {
    const raw = await fs.promises.readFile(mPath, 'utf8')
    const meta: PackageMeta = JSON.parse(raw)
    if (meta.deleted) return null
    return meta
  } catch {
    return null
  }
}

export async function listPackages(
  visibility?: Visibility,
  limit?: number,
): Promise<PackageMeta[]> {
  await ensureDirs()

  // Scan deployment dirs (meta.json is authoritative)
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(deploymentsDir(), { withFileTypes: true })
  } catch {
    return []
  }

  const results: PackageMeta[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const meta = await getPackageMeta(entry.name)
    if (!meta) continue
    if (visibility && meta.visibility !== visibility) continue
    results.push(meta)
  }

  results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return limit ? results.slice(0, limit) : results
}

export async function updateVisibility(
  id: string,
  visibility: Visibility,
): Promise<PackageMeta> {
  const meta = await getPackageMeta(id)
  if (!meta) throw new Error(`Package not found: ${id}`)

  const now = new Date().toISOString()
  const secure_token = visibility === 'private' ? generateToken() : undefined

  const updated: PackageMeta = {
    ...meta,
    visibility,
    secure_token,
    updatedAt: now,
  }
  if (visibility === 'public') {
    delete updated.secure_token
  }

  await fs.promises.writeFile(metaPath(id), JSON.stringify(updated, null, 2), 'utf8')
  await appendRegistryEvent({ ts: now, event: 'visibility', id, visibility, hash: meta.hash })

  return updated
}

export async function updatePackage(
  id: string,
  files: FileInput[],
  defaultPage?: string,
): Promise<PackageMeta> {
  const meta = await getPackageMeta(id)
  if (!meta) throw new Error(`Package not found: ${id}`)

  const now = new Date().toISOString()

  // Copy existing dist to temp, overlay incoming files, rename-swap
  const tmp = tmpDir()
  const tmpDist = path.join(tmp, 'dist')
  const existingDist = distDir(id)

  await copyDir(existingDist, tmpDist)
  await writeFiles(tmpDist, files)

  const allFiles = await listFilesRecursive(tmpDist)
  const hash = computeHash(allFiles.map(f => ({ path: f, content: '' })))

  if (defaultPage !== undefined && !allFiles.includes(defaultPage)) {
    throw new Error(`defaultPage "${defaultPage}" does not exist in the package files`)
  }

  const updated: PackageMeta = {
    ...meta,
    ...(defaultPage !== undefined ? { defaultPage } : {}),
    hash,
    files: allFiles,
    updatedAt: now,
  }

  await fs.promises.writeFile(path.join(tmp, 'meta.json'), JSON.stringify(updated, null, 2), 'utf8')

  // Atomically swap: rename existing to a tmp-old location, then new into place.
  // Remove any stale .__old dir left by a previous crashed update first.
  const oldDir = deploymentDir(id)
  const tmpOld = `${oldDir}.__old`
  await fs.promises.rm(tmpOld, { recursive: true, force: true })
  await fs.promises.rename(oldDir, tmpOld)
  await fs.promises.rename(tmp, oldDir)
  await fs.promises.rm(tmpOld, { recursive: true, force: true })

  await appendRegistryEvent({ ts: now, event: 'update', id, visibility: meta.visibility, hash })

  return updated
}

export async function updateDefaultPage(id: string, defaultPage: string): Promise<PackageMeta> {
  const meta = await getPackageMeta(id)
  if (!meta) throw new Error(`Package not found: ${id}`)

  const existingFiles = await listFilesRecursive(distDir(id))
  if (!existingFiles.includes(defaultPage)) {
    throw new Error(`defaultPage "${defaultPage}" does not exist in the package files`)
  }

  const now = new Date().toISOString()
  const updated: PackageMeta = { ...meta, defaultPage, updatedAt: now }
  await fs.promises.writeFile(metaPath(id), JSON.stringify(updated, null, 2), 'utf8')
  await appendRegistryEvent({ ts: now, event: 'update', id, visibility: meta.visibility, hash: meta.hash })
  return updated
}

export async function disablePackage(id: string): Promise<PackageMeta> {
  const meta = await getPackageMeta(id)
  if (!meta) throw new Error(`Package not found: ${id}`)

  const now = new Date().toISOString()
  const updated: PackageMeta = { ...meta, disabled: true, updatedAt: now }
  await fs.promises.writeFile(metaPath(id), JSON.stringify(updated, null, 2), 'utf8')
  await appendRegistryEvent({ ts: now, event: 'disable', id })
  return updated
}

export async function enablePackage(id: string): Promise<PackageMeta> {
  const meta = await getPackageMeta(id)
  if (!meta) throw new Error(`Package not found: ${id}`)

  const now = new Date().toISOString()
  const updated: PackageMeta = { ...meta, disabled: false, updatedAt: now }
  await fs.promises.writeFile(metaPath(id), JSON.stringify(updated, null, 2), 'utf8')
  await appendRegistryEvent({ ts: now, event: 'enable', id })
  return updated
}

// --- Streaming publish sessions ---
//
// Large packages can exceed the MCP request body limit (10MB) if sent in one
// JSON-RPC call, and inflate memory on both ends as base64. A session uploads
// files across several small calls that are written straight to a temp dir on
// disk; finalize promotes that dir to a deployment. Peak memory ~= one chunk.

interface PublishSession {
  id: string
  mode: 'create' | 'update'
  name?: string
  visibility?: Visibility
  packageId?: string
  defaultPage?: string
  createdAt: string
  fileCount: number
}

const SESSION_ID_RE = /^[a-f0-9]{32}$/
// Abandoned sessions (client crashed between begin and finalize) are swept on
// the next begin call once older than this.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

function sessionMetaPath(sid: string): string {
  return path.join(sessionDir(sid), 'session.json')
}

function assertSessionId(sid: string): void {
  if (!SESSION_ID_RE.test(sid)) throw new Error(`Invalid session id: ${sid}`)
}

async function readSession(sid: string): Promise<PublishSession> {
  assertSessionId(sid)
  try {
    const raw = await fs.promises.readFile(sessionMetaPath(sid), 'utf8')
    return JSON.parse(raw) as PublishSession
  } catch {
    throw new Error(`Publish session not found: ${sid}`)
  }
}

async function sweepStaleSessions(): Promise<void> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(sessionsDir(), { withFileTypes: true })
  } catch {
    return
  }
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const stat = await fs.promises.stat(path.join(sessionsDir(), entry.name))
      if (stat.mtimeMs < cutoff) {
        await fs.promises.rm(path.join(sessionsDir(), entry.name), { recursive: true, force: true })
      }
    } catch {
      // ignore — best-effort cleanup
    }
  }
}

export async function beginPublishSession(opts: {
  mode: 'create' | 'update'
  name?: string
  visibility?: Visibility
  packageId?: string
  defaultPage?: string
}): Promise<{ sessionId: string }> {
  await ensureDirs()
  await fs.promises.mkdir(sessionsDir(), { recursive: true })
  await sweepStaleSessions()

  if (opts.mode === 'create') {
    if (!opts.name) throw new Error('name is required to create a package')
    if (!opts.visibility) throw new Error('visibility is required to create a package')
  } else {
    if (!opts.packageId) throw new Error('package_id is required to update a package')
    const existing = await getPackageMeta(opts.packageId)
    if (!existing) throw new Error(`Package not found: ${opts.packageId}`)
  }

  const id = generateSessionId()
  const dir = sessionDir(id)
  const dist = path.join(dir, 'dist')
  await fs.promises.mkdir(dist, { recursive: true })

  // For updates, seed the session dist with the existing files once so later
  // chunks overlay onto them — no per-chunk copy of the whole package.
  if (opts.mode === 'update' && opts.packageId) {
    await copyDir(distDir(opts.packageId), dist)
  }

  const session: PublishSession = {
    id,
    mode: opts.mode,
    name: opts.name,
    visibility: opts.visibility,
    packageId: opts.packageId,
    defaultPage: opts.defaultPage,
    createdAt: new Date().toISOString(),
    fileCount: 0,
  }
  await fs.promises.writeFile(sessionMetaPath(id), JSON.stringify(session), 'utf8')

  return { sessionId: id }
}

export async function uploadSessionFiles(
  sid: string,
  files: FileInput[],
): Promise<{ received: number; total: number }> {
  const session = await readSession(sid)
  const dist = path.join(sessionDir(sid), 'dist')
  await writeFiles(dist, files)

  session.fileCount += files.length
  await fs.promises.writeFile(sessionMetaPath(sid), JSON.stringify(session), 'utf8')

  return { received: files.length, total: session.fileCount }
}

export async function finalizePublishSession(
  sid: string,
  defaultPageOverride?: string,
): Promise<PackageMeta> {
  const session = await readSession(sid)
  const dir = sessionDir(sid)
  const dist = path.join(dir, 'dist')

  const allFiles = (await listFilesRecursive(dist)).map((f) => f.split(path.sep).join('/'))
  if (allFiles.length === 0) {
    await fs.promises.rm(dir, { recursive: true, force: true })
    throw new Error('No files were uploaded to the session')
  }

  const requestedPage = defaultPageOverride ?? session.defaultPage
  const hash = await hashDir(dist)
  const now = new Date().toISOString()

  if (session.mode === 'create') {
    const effectivePage = requestedPage ?? (allFiles.length === 1 ? allFiles[0] : undefined)
    if (!effectivePage) {
      throw new Error('defaultPage is required when publishing multiple files')
    }
    if (!allFiles.includes(effectivePage)) {
      throw new Error(`defaultPage "${effectivePage}" does not exist in the package files`)
    }

    const id = generateId(session.name!)
    const secure_token = session.visibility === 'private' ? generateToken() : undefined
    const meta: PackageMeta = {
      id,
      name: session.name!,
      slug: id,
      visibility: session.visibility!,
      ...(secure_token ? { secure_token } : {}),
      defaultPage: effectivePage,
      hash,
      files: allFiles,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    }

    // Promote the session dir into place: drop the session sidecar, write meta,
    // rename atomically.
    await fs.promises.rm(sessionMetaPath(sid), { force: true })
    await fs.promises.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
    await fs.promises.rename(dir, deploymentDir(id))

    await appendRegistryEvent({ ts: now, event: 'publish', id, visibility: meta.visibility, hash })
    return meta
  }

  // update mode
  const existing = await getPackageMeta(session.packageId!)
  if (!existing) throw new Error(`Package not found: ${session.packageId}`)

  if (requestedPage !== undefined && !allFiles.includes(requestedPage)) {
    throw new Error(`defaultPage "${requestedPage}" does not exist in the package files`)
  }

  const updated: PackageMeta = {
    ...existing,
    ...(requestedPage !== undefined ? { defaultPage: requestedPage } : {}),
    hash,
    files: allFiles,
    updatedAt: now,
  }

  await fs.promises.rm(sessionMetaPath(sid), { force: true })
  await fs.promises.writeFile(path.join(dir, 'meta.json'), JSON.stringify(updated, null, 2), 'utf8')

  // Atomic swap, mirroring updatePackage().
  const target = deploymentDir(session.packageId!)
  const tmpOld = `${target}.__old`
  await fs.promises.rm(tmpOld, { recursive: true, force: true })
  await fs.promises.rename(target, tmpOld)
  await fs.promises.rename(dir, target)
  await fs.promises.rm(tmpOld, { recursive: true, force: true })

  await appendRegistryEvent({ ts: now, event: 'update', id: session.packageId!, visibility: existing.visibility, hash })
  return updated
}

export async function deletePackage(id: string): Promise<void> {
  const meta = await getPackageMeta(id)
  if (!meta) throw new Error(`Package not found: ${id}`)

  await fs.promises.rm(deploymentDir(id), { recursive: true, force: true })

  await appendRegistryEvent({
    ts: new Date().toISOString(),
    event: 'delete',
    id,
  })
}
