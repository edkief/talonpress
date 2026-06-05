import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  publishPackage,
  getPackageMeta,
  listPackages,
  updateVisibility,
  updatePackage,
  deletePackage,
} from '../storage/deployments'
import { config } from '../config'

function packageUrl(id: string, token?: string): string {
  const base = `${config.publicBaseUrl}/pub/${id}`
  return token ? `${base}?token=${token}` : base
}

export function registerTools(server: McpServer): void {
  // publish_package
  server.tool(
    'publish_package',
    'Compiles and publishes a new static web package. Returns the deployment ID, access URL, and secure_token if private.',
    {
      name: z.string().min(1).describe('Display name for the package'),
      visibility: z.enum(['public', 'private']).describe('Access visibility'),
      files: z
        .array(z.object({ path: z.string(), content: z.string() }))
        .min(1)
        .describe('Array of files to publish'),
    },
    async ({ name, visibility, files }) => {
      const meta = await publishPackage(name, visibility, files)
      const url = packageUrl(meta.id, meta.secure_token)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: meta.id,
              url,
              visibility: meta.visibility,
              ...(meta.secure_token ? { secure_token: meta.secure_token } : {}),
              hash: meta.hash,
              createdAt: meta.createdAt,
            }),
          },
        ],
      }
    },
  )

  // list_packages
  server.tool(
    'list_packages',
    'Returns an array of available packages with their visibility status and access URLs.',
    {
      visibility: z
        .enum(['public', 'private'])
        .optional()
        .describe('Filter by visibility'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of results'),
    },
    async ({ visibility, limit }) => {
      const packages = await listPackages(visibility, limit)
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
        content: [{ type: 'text', text: JSON.stringify(result) }],
      }
    },
  )

  // get_package_status
  server.tool(
    'get_package_status',
    'Fetches the live status, route configuration, file manifest, and active tokens for a specific package.',
    {
      package_id: z.string().min(1).describe('Package ID'),
    },
    async ({ package_id }) => {
      const meta = await getPackageMeta(package_id)
      if (!meta) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Package not found' }) }],
          isError: true,
        }
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: meta.id,
              name: meta.name,
              visibility: meta.visibility,
              url: packageUrl(meta.id, meta.secure_token),
              hash: meta.hash,
              files: meta.files,
              ...(meta.secure_token ? { secure_token: meta.secure_token } : {}),
              createdAt: meta.createdAt,
              updatedAt: meta.updatedAt,
            }),
          },
        ],
      }
    },
  )

  // update_visibility
  server.tool(
    'update_visibility',
    "Modifies access permissions. Transitioning to 'private' automatically generates a new secure token.",
    {
      package_id: z.string().min(1).describe('Package ID'),
      visibility: z.enum(['public', 'private']).describe('New visibility'),
    },
    async ({ package_id, visibility }) => {
      let meta
      try {
        meta = await updateVisibility(package_id, visibility)
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        }
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: meta.id,
              visibility: meta.visibility,
              url: packageUrl(meta.id, meta.secure_token),
              ...(meta.secure_token ? { secure_token: meta.secure_token } : {}),
              updatedAt: meta.updatedAt,
            }),
          },
        ],
      }
    },
  )

  // update_package
  server.tool(
    'update_package',
    'Modifies or appends specific files within an existing deployment. Overwrites matching paths, leaves others untouched.',
    {
      package_id: z.string().min(1).describe('Package ID'),
      files: z
        .array(z.object({ path: z.string(), content: z.string() }))
        .min(1)
        .describe('Files to overwrite/add'),
    },
    async ({ package_id, files }) => {
      let meta
      try {
        meta = await updatePackage(package_id, files)
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        }
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: meta.id,
              hash: meta.hash,
              files: meta.files,
              updatedAt: meta.updatedAt,
            }),
          },
        ],
      }
    },
  )

  // delete_package
  server.tool(
    'delete_package',
    'Purges the deployment directory and marks the package as deleted in the registry log.',
    {
      package_id: z.string().min(1).describe('Package ID'),
    },
    async ({ package_id }) => {
      try {
        await deletePackage(package_id)
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
          isError: true,
        }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ deleted: true, id: package_id }) }],
      }
    },
  )
}
