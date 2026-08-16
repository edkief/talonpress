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
  renewPackageToken,
  setPackageContext,
} from '../storage/deployments'
import { packageAccessUrl as packageUrl } from '../storage/urls'
import { renderContextPayload } from '../agent/context'
import { config } from '../config'

// Shared by every tool that accepts a page context. Kept loose here — the real
// validation, with its size limits, lives at the storage write boundary in
// storage/context.ts, so there is one place to change when the limits move.
const contextInput = z
  .object({
    summary: z.string().optional().describe('What this package is and who it is for'),
    outline: z.array(z.string()).optional().describe('Section or page headings'),
    facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
      .describe('Short key/value facts an agent should be able to quote'),
    excerpt: z.string().optional().describe('A representative passage'),
    version: z.string().optional()
      .describe('Optional cache key. Derived from the content when omitted; pin it only if you manage your own versioning'),
  })
  .describe('Agent-facing description of the package, used when a reader chats about it')

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
        context: contextInput.optional(),
      },
    },
    async ({ name, visibility, files, default_page, context }) => {
      try {
        const meta = await publishPackage(name, visibility, files, default_page, context)
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
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }], isError: true }
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
      description:
        "Modifies access permissions. The existing token is preserved across toggles — only a fresh package (no token yet) gets one on going private. Use renew_token to explicitly rotate a token that has leaked.",
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
        context: contextInput.optional(),
      },
    },
    async ({ mode, name, visibility, package_id, default_page, context }) => {
      try {
        const { sessionId } = await beginPublishSession({ mode, name, visibility, packageId: package_id, defaultPage: default_page, context })
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
        context: contextInput.optional().describe('Overrides the context given at begin'),
      },
    },
    async ({ session_id, default_page, context }) => {
      try {
        const meta = await finalizePublishSession(session_id, default_page, context)
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

  // renew_token
  server.registerTool(
    'renew_token',
    {
      description:
        'Rotates the secure_token of a private package. Anyone holding the previous token loses access. Updates tokenGeneratedAt. Package must be private.',
      inputSchema: {
        package_id: z.string().min(1).describe('Package ID'),
      },
    },
    async ({ package_id }) => {
      let meta
      try {
        meta = await renewPackageToken(package_id)
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
              url: packageUrl(meta.id, meta.secure_token),
              secure_token: meta.secure_token,
              token_generated_at: meta.tokenGeneratedAt,
            }),
          },
        ],
      }
    },
  )

  // set_package_context
  server.registerTool(
    'set_package_context',
    {
      description:
        'Sets what an agent should know about a package when a reader chats about it from the ' +
        'embedded chat bubble: a summary, an outline, key facts and a representative excerpt. ' +
        'Independent of publishing — use it to correct or enrich the agent\'s view without ' +
        'republishing files. Pass clear=true to remove the context entirely. ' +
        'Returns the resulting cache version and whether the size budget forced anything out.',
      inputSchema: {
        package_id: z.string().min(1).describe('Package ID'),
        context: contextInput.optional(),
        clear: z.boolean().optional().describe('Remove the stored context instead of setting one'),
      },
    },
    async ({ package_id, context, clear }) => {
      try {
        if (!clear && !context) {
          throw new Error('Provide either a context to set or clear=true')
        }
        const meta = await setPackageContext(package_id, clear ? null : context!)
        if (!meta.context) {
          return { content: [{ type: 'text', text: JSON.stringify({ id: meta.id, cleared: true }) }] }
        }
        const rendered = renderContextPayload(meta)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: meta.id,
                version: rendered.version,
                char_count: JSON.stringify(rendered).length,
                // Surfaced rather than silently applied: an author who is losing
                // content to the budget should be able to see it and shorten it.
                truncated: Boolean(rendered.truncated),
                updated_at: meta.updatedAt,
              }),
            },
          ],
        }
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }], isError: true }
      }
    },
  )

  // get_package_context
  server.registerTool(
    'get_package_context',
    {
      description:
        'Returns the stored agent context for a package alongside the payload actually sent to ' +
        'the agent — which may be truncated to the size budget, or derived from the file list ' +
        'when no context has been set.',
      inputSchema: {
        package_id: z.string().min(1).describe('Package ID'),
      },
    },
    async ({ package_id }) => {
      try {
        const meta = await getPackageMeta(package_id)
        if (!meta) throw new Error(`Package not found: ${package_id}`)
        const rendered = renderContextPayload(meta)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: meta.id,
                stored: meta.context ?? null,
                derived: !meta.context,
                rendered,
                version: rendered.version,
                char_count: JSON.stringify(rendered).length,
                max_chars: config.agentMaxContextChars,
              }),
            },
          ],
        }
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }], isError: true }
      }
    },
  )
}
