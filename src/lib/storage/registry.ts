import fs from 'fs'
import path from 'path'
import { registryPath, storageRoot } from './paths'
import type { RegistryEvent, PackageIndex, Visibility } from './types'

async function ensureRegistryExists(): Promise<void> {
  const rPath = registryPath()
  const dir = path.dirname(rPath)
  await fs.promises.mkdir(dir, { recursive: true })
  // Touch file if it doesn't exist
  const handle = await fs.promises.open(rPath, 'a')
  await handle.close()
}

export async function appendRegistryEvent(event: RegistryEvent): Promise<void> {
  await ensureRegistryExists()
  const line = JSON.stringify(event) + '\n'
  await fs.promises.appendFile(registryPath(), line, 'utf8')
}

export async function foldRegistry(): Promise<PackageIndex> {
  await ensureRegistryExists()
  const rPath = registryPath()

  const content = await fs.promises.readFile(rPath, 'utf8')
  const index: PackageIndex = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const event: RegistryEvent = JSON.parse(trimmed)
      if (event.event === 'delete') {
        if (index[event.id]) {
          index[event.id].deleted = true
        } else {
          index[event.id] = { visibility: 'public', deleted: true }
        }
      } else {
        index[event.id] = {
          visibility: (event.visibility ?? index[event.id]?.visibility ?? 'public') as Visibility,
          deleted: false,
          hash: event.hash ?? index[event.id]?.hash,
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return index
}
