import { tool } from 'ai';
import type { ToolSet } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// ─── Public config type ───────────────────────────────────────────────────────

export interface TalonpressConfig {
  /** Full URL of the TalonPress MCP endpoint. */
  url: string;
  /** Transport protocol (default: streamable-http). */
  transport?: 'sse' | 'streamable-http';
  /** Optional headers forwarded to every MCP request (e.g. Authorization). */
  headers?: Record<string, string>;
}

// ─── Internal MCP client (lazy, cached per url+headers) ─────────────────────

let cachedClient: Client | null = null;
let cachedKey: string | null = null;

async function getClient(cfg: TalonpressConfig): Promise<Client> {
  const key = JSON.stringify({ url: cfg.url, headers: cfg.headers ?? {} });
  if (cachedClient && cachedKey === key) return cachedClient;

  const client = new Client({ name: 'talonpress-mcp-tools', version: '0.1.0' });
  const url = new URL(cfg.url);
  const requestInit: RequestInit = cfg.headers ? { headers: cfg.headers } : {};

  const transport =
    cfg.transport === 'sse'
      ? new SSEClientTransport(url, { requestInit })
      : new StreamableHTTPClientTransport(url, { requestInit });

  await client.connect(transport);

  cachedClient = client;
  cachedKey = key;
  return client;
}

async function callTalonpress(
  cfg: TalonpressConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const client = await getClient(cfg);
    const result = await client.callTool({ name: toolName, arguments: args });
    const textParts = (result.content as { type: string; text?: string }[])
      .filter((c) => c.type === 'text')
      .map((c) => c.text as string);
    return textParts.join('\n') || JSON.stringify(result.content);
  } catch (err) {
    // Reset cached client so next call reconnects
    cachedClient = null;
    cachedKey = null;
    throw err;
  }
}

// ─── Folder walker ────────────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
}

// A located-but-not-yet-read file: its absolute path and its posix path
// relative to the publish base. Enumerating refs first (without content) keeps
// peak memory bounded — content is read lazily, one chunk at a time.
interface FileRef {
  abs: string;
  rel: string;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build']);

// Largest content payload per upload chunk. base64 + JSON-RPC framing push the
// real request a little above this, so the budget sits well under the server's
// 10MB body limit. A single file larger than this is still sent on its own.
const MAX_CHUNK_BYTES = 15 * 1024 * 1024;

async function readFileEntry(ref: FileRef): Promise<FileEntry> {
  const buf = await fs.readFile(ref.abs);
  // Binary detection: scan first 8 KB for null bytes
  const probe = buf.subarray(0, 8192);
  const isBinary = probe.includes(0x00);
  return isBinary
    ? { path: ref.rel, content: buf.toString('base64'), encoding: 'base64' }
    : { path: ref.rel, content: buf.toString('utf8'), encoding: 'utf8' };
}

async function walkDir(current: string, base: string, into: Map<string, FileRef>): Promise<void> {
  const items = await fs.readdir(current, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(current, item.name);
    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name)) continue;
      await walkDir(full, base, into);
    } else if (item.isFile()) {
      const rel = path.relative(base, full).split(path.sep).join('/');
      into.set(rel, { abs: full, rel });
    }
  }
}

// Full recursive walk — used for the dry-run preview. Returns refs only (no
// content read).
async function collectAll(dir: string): Promise<FileRef[]> {
  const refs = new Map<string, FileRef>();
  await walkDir(dir, dir, refs);
  return [...refs.values()];
}

// Selection-aware collector. Each selection entry is a file, a subdirectory
// (uploaded recursively), or "." for the whole folder. Paths that escape the
// base folder or do not exist are reported via `missing` instead of throwing.
// Returns refs only — content is streamed later.
async function collectSelected(
  baseDir: string,
  selection: string[],
): Promise<{ files: FileRef[]; missing: string[] }> {
  const refs = new Map<string, FileRef>();
  const missing: string[] = [];

  for (const raw of selection) {
    const entry = raw.trim();
    const abs = path.resolve(baseDir, entry);
    // Containment check: reject anything resolving outside baseDir.
    const rel = path.relative(baseDir, abs);
    if (path.isAbsolute(entry) || rel.startsWith('..')) {
      missing.push(`${entry} (outside publish folder)`);
      continue;
    }

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(abs);
    } catch {
      missing.push(entry);
      continue;
    }

    if (stat.isDirectory()) {
      await walkDir(abs, baseDir, refs);
    } else if (stat.isFile()) {
      const relPosix = path.relative(baseDir, abs).split(path.sep).join('/');
      refs.set(relPosix, { abs, rel: relPosix });
    } else {
      missing.push(entry);
    }
  }

  return { files: [...refs.values()], missing };
}

// Lazily read refs and yield them in chunks whose combined content stays under
// MAX_CHUNK_BYTES. Only the current chunk is held in memory; the previous one
// is freed once its upload call returns.
async function* chunkFiles(refs: FileRef[]): AsyncGenerator<FileEntry[]> {
  let batch: FileEntry[] = [];
  let size = 0;
  for (const ref of refs) {
    const entry = await readFileEntry(ref);
    if (batch.length > 0 && size + entry.content.length > MAX_CHUNK_BYTES) {
      yield batch;
      batch = [];
      size = 0;
    }
    batch.push(entry);
    size += entry.content.length;
  }
  if (batch.length > 0) yield batch;
}

// Pull the deployment id (or any string field) out of an MCP tool's JSON text
// response. Tolerates leading/trailing prose around the JSON.
function parseField(text: string, field: string): string | undefined {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const val = obj[field];
    return typeof val === 'string' ? val : undefined;
  } catch {
    return undefined;
  }
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

/**
 * Returns a Vercel AI SDK ToolSet with all TalonPress tools wired to the given
 * config. Pass `workspaceDir` to resolve relative `folder` paths; defaults to
 * `process.cwd()`.
 */
export function getTalonpressTools(cfg: TalonpressConfig, workspaceDir?: string): ToolSet {
  const resolveFolder = (folder: string) =>
    path.isAbsolute(folder) ? folder : path.join(workspaceDir ?? process.cwd(), folder);

  return {
    talonpress_publish: tool({
      description:
        'Publish or update a static web package on TalonPress by uploading selected files from a local folder. ' +
        'Pass `files` to publish exactly the paths you intend (a folder often holds unrelated leftovers from earlier tasks). ' +
        'Omit `files` to do a dry run: the tool lists what it WOULD publish without uploading anything — review it, then ' +
        'call again with the paths you want (use "." to publish the whole folder once you have confirmed it is clean). ' +
        'Omit package_id to create a new package; provide it to update an existing one (overwrites matching file paths). ' +
        'Handles text and binary files automatically.',
      inputSchema: z.object({
        folder: z
          .string()
          .describe('Path to the local folder to publish from (absolute, or relative to the workspace).'),
        files: z
          .array(z.string())
          .optional()
          .describe(
            'Relative paths (to `folder`) to publish. Each entry may be a file or a subdirectory ' +
              '(uploaded recursively); use "." to publish the entire folder. Omit this to do a dry run ' +
              'that lists what WOULD be published without uploading — then call again with the paths you want.',
          ),
        name: z
          .string()
          .describe('Display name for the package. Required when creating a new package (no package_id).'),
        visibility: z
          .enum(['public', 'private'])
          .optional()
          .describe('Access visibility (default: public). Only used when creating a new package.'),
        package_id: z
          .string()
          .optional()
          .describe('Existing package ID to update. Omit to create a new package.'),
        default_page: z
          .string()
          .describe(
            'Entry-point file served at the package root (e.g. index.html). ' +
              'Specify the filename that should be served when the package root URL is requested.',
          ),
      }),
      execute: async (input) => {
        try {
          const absFolder = resolveFolder(input.folder);

          let stat: Awaited<ReturnType<typeof fs.stat>>;
          try {
            stat = await fs.stat(absFolder);
          } catch {
            return `Error: folder not found: ${input.folder}`;
          }
          if (!stat.isDirectory()) return `Error: not a directory: ${input.folder}`;

          // ── Dry run: no selection given — preview, never upload ──────────────
          if (!input.files || input.files.length === 0) {
            const all = await collectAll(absFolder);
            if (all.length === 0) return `Error: folder is empty: ${input.folder}`;

            // Size from stat — never reads file content into memory.
            const sizes = await Promise.all(all.map((f) => fs.stat(f.abs).then((s) => s.size).catch(() => 0)));
            const totalKb = Math.round(sizes.reduce((s, n) => s + n, 0) / 1024);
            const MAX_LIST = 100;
            const listed = all
              .slice(0, MAX_LIST)
              .map((f) => `  ${f.rel}`)
              .join('\n');
            const more = all.length > MAX_LIST ? `\n  …and ${all.length - MAX_LIST} more` : '';

            return (
              `Dry run — nothing was published. ` +
              `'${input.folder}' contains ${all.length} file(s) (~${totalKb} KB):\n` +
              `${listed}${more}\n\n` +
              `Call talonpress_publish again with \`files\` listing only the paths to publish ` +
              `(each may be a file or subdirectory). Use \`files: ["."]\` to publish the entire folder.`
            );
          }

          // ── Publish: explicit selection ──────────────────────────────────────
          const { files: refs, missing } = await collectSelected(absFolder, input.files);
          if (missing.length > 0) {
            return `Error: these selected paths were not found or are invalid: ${missing.join(', ')}`;
          }
          if (refs.length === 0) {
            return `Error: selection resolved to no files: ${input.files.join(', ')}`;
          }
          if (!refs.some((f) => f.rel === input.default_page)) {
            return `Error: default_page "${input.default_page}" is not among the selected files`;
          }

          const MAX_LIST = 100;
          const manifest = refs
            .slice(0, MAX_LIST)
            .map((f) => `  ${f.rel}`)
            .join('\n');
          const more = refs.length > MAX_LIST ? `\n  …and ${refs.length - MAX_LIST} more` : '';

          // Stream the upload: open a session, push files in chunks each well
          // under the server body limit, then finalize. Peak memory ~= one chunk
          // — large folders no longer build one giant in-memory base64 payload.
          const begin = await callTalonpress(cfg, 'begin_publish_session', {
            mode: input.package_id ? 'update' : 'create',
            ...(input.package_id
              ? { package_id: input.package_id }
              : { name: input.name, visibility: input.visibility ?? 'public' }),
            default_page: input.default_page,
          });
          const sessionId = parseField(begin, 'session_id');
          if (!sessionId) return `Error: failed to start publish session: ${begin}`;

          let chunks = 0;
          for await (const chunk of chunkFiles(refs)) {
            chunks++;
            const up = await callTalonpress(cfg, 'upload_session_files', {
              session_id: sessionId,
              files: chunk,
            });
            const err = parseField(up, 'error');
            if (err) return `Error uploading files (chunk ${chunks}): ${err}`;
          }

          const result = await callTalonpress(cfg, 'finalize_publish_session', {
            session_id: sessionId,
            default_page: input.default_page,
          });

          const summary = `Published ${refs.length} file(s) in ${chunks} chunk(s):\n${manifest}${more}`;
          return `${summary}\n${result}`;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    talonpress_list_packages: tool({
      description: 'List available TalonPress packages with their visibility status and access URLs.',
      inputSchema: z.object({
        visibility: z
          .enum(['public', 'private'])
          .optional()
          .describe('Filter by visibility.'),
        limit: z
          .number()
          .int()
          .optional()
          .describe('Maximum number of results.'),
      }),
      execute: async (input) => {
        try {
          return await callTalonpress(cfg, 'list_packages', input as Record<string, unknown>);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    talonpress_get_package_status: tool({
      description:
        'Fetch the live status, route configuration, file manifest, and active tokens for a TalonPress package.',
      inputSchema: z.object({
        package_id: z.string().describe('Package ID.'),
      }),
      execute: async (input) => {
        try {
          return await callTalonpress(cfg, 'get_package_status', input as Record<string, unknown>);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    talonpress_update_visibility: tool({
      description:
        'Modify the access visibility of a TalonPress package. ' +
        'Transitioning to "private" automatically generates a new secure token.',
      inputSchema: z.object({
        package_id: z.string().describe('Package ID.'),
        visibility: z.enum(['public', 'private']).describe('New visibility.'),
      }),
      execute: async (input) => {
        try {
          return await callTalonpress(cfg, 'update_visibility', input as Record<string, unknown>);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    talonpress_delete_package: tool({
      description: 'Permanently delete a TalonPress package and purge its deployment files.',
      inputSchema: z.object({
        package_id: z.string().describe('Package ID to delete.'),
      }),
      execute: async (input) => {
        try {
          return await callTalonpress(cfg, 'delete_package', input as Record<string, unknown>);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
  };
}
