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
  server.registerTool(
    'publish_package',
    {
      description: 'Compiles and publishes a new static web package. Returns the deployment ID, access URL, and secure_token if private.',
      inputSchema: {
        name: z.string().min(1).describe('Display name for the package'),
        visibility: z.enum(['public', 'private']).describe('Access visibility'),
        files: z
          .array(
            z.object({
              path: z.string(),
              content: z.string(),
              encoding: z.enum(['utf8', 'base64']).optional().describe('Encoding of content; use base64 for binary files such as images'),
            }),
          )
          .min(1)
          .describe('Array of files to publish'),
        default_page: z.string().optional().describe('Entry-point file served at the package root (default: index.html)'),
      },
    },
    async ({ name, visibility, files, default_page }) => {
      const meta = await publishPackage(name, visibility, files, default_page)
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
              ...(meta.defaultPage ? { default_page: meta.defaultPage } : {}),
              hash: meta.hash,
              createdAt: meta.createdAt,
            }),
          },
        ],
      }
    },
  )

  // list_packages
  server.registerTool(
    'list_packages',
    {
      description: 'Returns an array of available packages with their visibility status and access URLs.',
      inputSchema: {
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
    },
    async ({ visibility, limit }) => {
      const packages = await listPackages(visibility, limit)
      const result = packages.map(meta => ({
        id: meta.id,
        name: meta.name,
        visibility: meta.visibility,
        url: packageUrl(meta.id, meta.secure_token),
        ...(meta.defaultPage ? { default_page: meta.defaultPage } : {}),
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
  server.registerTool(
    'get_package_status',
    {
      description: 'Fetches the live status, route configuration, file manifest, and active tokens for a specific package.',
      inputSchema: {
        package_id: z.string().min(1).describe('Package ID'),
      },
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
              ...(meta.secure_token ? { secure_token: meta.secure_token } : {}),
              ...(meta.defaultPage ? { default_page: meta.defaultPage } : {}),
              hash: meta.hash,
              files: meta.files,
              createdAt: meta.createdAt,
              updatedAt: meta.updatedAt,
            }),
          },
        ],
      }
    },
  )

  // update_visibility
  server.registerTool(
    'update_visibility',
    {
      description: "Modifies access permissions. Transitioning to 'private' automatically generates a new secure token.",
      inputSchema: {
        package_id: z.string().min(1).describe('Package ID'),
        visibility: z.enum(['public', 'private']).describe('New visibility'),
      },
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
  server.registerTool(
    'update_package',
    {
      description: 'Modifies or appends specific files within an existing deployment. Overwrites matching paths, leaves others untouched.',
      inputSchema: {
        package_id: z.string().min(1).describe('Package ID'),
        files: z
          .array(
            z.object({
              path: z.string(),
              content: z.string(),
              encoding: z.enum(['utf8', 'base64']).optional().describe('Encoding of content; use base64 for binary files such as images'),
            }),
          )
          .min(1)
          .describe('Files to overwrite/add'),
        default_page: z.string().optional().describe('Change the entry-point file served at the package root'),
      },
    },
    async ({ package_id, files, default_page }) => {
      let meta
      try {
        meta = await updatePackage(package_id, files, default_page)
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
              ...(meta.defaultPage ? { default_page: meta.defaultPage } : {}),
              updatedAt: meta.updatedAt,
            }),
          },
        ],
      }
    },
  )

  // delete_package
  server.registerTool(
    'delete_package',
    {
      description: 'Purges the deployment directory and marks the package as deleted in the registry log.',
      inputSchema: {
        package_id: z.string().min(1).describe('Package ID'),
      },
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
