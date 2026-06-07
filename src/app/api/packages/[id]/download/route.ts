import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { zipSync } from 'fflate'
import { getPackageMeta } from '@/lib/storage/deployments'
import { distDir } from '@/lib/storage/paths'

async function collectFiles(dir: string, base: string): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {}
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return result
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      Object.assign(result, await collectFiles(fullPath, base))
    } else {
      const relativePath = path.relative(base, fullPath)
      const data = await fs.promises.readFile(fullPath)
      result[relativePath] = new Uint8Array(data)
    }
  }
  return result
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  const meta = await getPackageMeta(id)
  if (!meta) {
    return new NextResponse('Package Not Found', { status: 404 })
  }

  const base = distDir(id)
  const files = await collectFiles(base, base)

  if (Object.keys(files).length === 0) {
    return new NextResponse('Package has no files', { status: 404 })
  }

  const zip = zipSync(files, { level: 6 })

  const safeName = meta.name.replace(/[^a-z0-9_\-]/gi, '_')
  return new NextResponse(zip, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"`,
      'Content-Length': zip.byteLength.toString(),
    },
  })
}
