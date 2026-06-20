import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  publishPackage,
  getPackageMeta,
  listPackages,
  updateVisibility,
  updatePackage,
  deletePackage,
  beginPublishSession,
  uploadSessionFiles,
  finalizePublishSession,
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
        default_page: z.string().min(1).describe('Entry-point file served at the package root (e.g. index.html)'),
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

  // ─── Streaming publish session (for large packages) ───────────────────────
  // Splits a publish across many small calls so no single request approaches
  // the 10MB MCP body limit and neither side base64-buffers the whole package.

  // begin_publish_session
  server.registerTool(
    'begin_publish_session',
    {
      description:
        'Starts a streaming publish session for large packages. Returns a session_id; ' +
        'upload files with upload_session_files, then call finalize_publish_session to publish. ' +
        'Use mode "create" (with name + visibility) for a new package, or "update" (with package_id) for an existing one.',
      inputSchema: {
        mode: z.enum(['create', 'update']).describe('"create" a new package or "update" an existing one'),
        name: z.string().min(1).optional().describe('Display name (required for mode "create")'),
        visibility: z.enum(['public', 'private']).optional().describe('Access visibility (required for mode "create")'),
        package_id: z.string().min(1).optional().describe('Package ID (required for mode "update")'),
        default_page: z.string().min(1).optional().describe('Entry-point file served at the package root; may also be set at finalize'),
      },
    },
    async ({ mode, name, visibility, package_id, default_page }) => {
      try {
        const { sessionId } = await beginPublishSession({ mode, name, visibility, packageId: package_id, defaultPage: default_page })
        return { content: [{ type: 'text', text: JSON.stringify({ session_id: sessionId }) }] }
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }], isError: true }
      }
    },
  )

  // upload_session_files
  server.registerTool(
    'upload_session_files',
    {
      description:
        'Uploads a chunk of files to an open publish session. Files are written straight to disk. ' +
        'Keep each call comfortably under 10MB; call repeatedly until all files are sent, then finalize_publish_session.',
      inputSchema: {
        session_id: z.string().min(1).describe('Session ID from begin_publish_session'),
        files: z
          .array(
            z.object({
              path: z.string(),
              content: z.string(),
              encoding: z.enum(['utf8', 'base64']).optional().describe('Encoding of content; use base64 for binary files such as images'),
            }),
          )
          .min(1)
          .describe('Files in this chunk'),
      },
    },
    async ({ session_id, files }) => {
      try {
        const res = await uploadSessionFiles(session_id, files)
        return { content: [{ type: 'text', text: JSON.stringify(res) }] }
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }], isError: true }
      }
    },
  )

  // finalize_publish_session
  server.registerTool(
    'finalize_publish_session',
    {
      description:
        'Finalizes a publish session: promotes the uploaded files to a live deployment and returns the deployment ID, URL, and secure_token if private.',
      inputSchema: {
        session_id: z.string().min(1).describe('Session ID from begin_publish_session'),
        default_page: z.string().min(1).optional().describe('Entry-point file served at the package root (overrides the value given at begin)'),
      },
    },
    async ({ session_id, default_page }) => {
      try {
        const meta = await finalizePublishSession(session_id, default_page)
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
                files: meta.files,
                createdAt: meta.createdAt,
                updatedAt: meta.updatedAt,
              }),
            },
          ],
        }
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }], isError: true }
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
