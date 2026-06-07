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

async function writeFiles(baseDir: string, files: FileInput[]): Promise<void> {
  for (const file of files) {
    const filePath = path.join(baseDir, file.path)
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    if (file.encoding === 'base64') {
      await fs.promises.writeFile(filePath, Buffer.from(file.content, 'base64'))
    } else {
      await fs.promises.writeFile(filePath, file.content, 'utf8')
    }
  }
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
): Promise<PackageMeta> {
  await ensureDirs()

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
    hash,
    files: files.map(f => f.path),
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

  const updated: PackageMeta = {
    ...meta,
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
