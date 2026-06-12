import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listPackages, getPackageMeta } from '../storage/deployments'
import { config } from '../config'

function packageUrl(id: string, token?: string): string {
  const base = `${config.publicBaseUrl}/pub/${id}`
  return token ? `${base}?token=${token}` : base
}

export function registerResources(server: McpServer): void {
  // packages://list
  server.registerResource(
    'packages-list',
    'packages://list',
    { description: 'Dynamically updated JSON list of all active packages' },
    async () => {
      const packages = await listPackages()
      const result = packages.map(meta => ({
        id: meta.id,
        name: meta.name,
        visibility: meta.visibility,
        url: packageUrl(meta.id, meta.secure_token),
        hash: meta.hash,
        files: meta.files,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      }))
      return {
        contents: [
          {
            uri: 'packages://list',
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    },
  )

  // packages://{package_id}/meta
  server.registerResource(
    'package-meta',
    new ResourceTemplate('packages://{package_id}/meta', { list: undefined }),
    { description: 'Raw meta.json configuration for an individual package' },
    async (uri, { package_id }) => {
      const meta = await getPackageMeta(package_id as string)
      if (!meta) {
        throw new Error(`Package not found: ${package_id}`)
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(meta, null, 2),
          },
        ],
      }
    },
  )
}
