export interface FileInput {
  path: string
  content: string
  encoding?: 'utf8' | 'base64'
}

export type Visibility = 'public' | 'private'

/**
 * What an agent should know about a package before answering questions about it.
 * Authored over MCP by whoever published the package — TalonPress validates, caps
 * and renders it, but never invents it.
 *
 * Deliberately holds no title, url or visibility: those are derived from the
 * PackageMeta around it at render time, so they cannot drift from the package's
 * actual state. `updatedAt` is the stored write time, never a request time — the
 * rendered form of this object is a prompt-cache key upstream, so anything that
 * varies per request costs a cache miss on every message.
 */
export interface PackageContext {
  /** What this package is and who it is for. */
  summary?: string
  /** Section or page headings, e.g. "docs/api.md — API reference". */
  outline?: string[]
  facts?: Record<string, string | number | boolean>
  /** A representative passage. First thing dropped when the size cap bites. */
  excerpt?: string
  /** Author-pinned cache key. Derived from the rendered content when absent. */
  version?: string
  updatedAt?: string
}

export interface PackageMeta {
  id: string
  name: string
  slug: string
  visibility: Visibility
  secure_token?: string
  /** ISO timestamp of the most recent secure_token generation. Undefined for tokens generated before this field was tracked. */
  tokenGeneratedAt?: string
  defaultPage?: string
  /** Agent-facing description of the package. Set over MCP, absent by default. */
  context?: PackageContext
  hash: string
  files: string[]
  /** Total size of all package files in bytes. Recomputed on every (re)publish. */
  sizeBytes?: number
  createdAt: string
  updatedAt: string
  deleted: boolean
  disabled?: boolean
}

export type RegistryEventType = 'publish' | 'update' | 'visibility' | 'delete' | 'disable' | 'enable' | 'token_renew' | 'context'

export interface RegistryEvent {
  ts: string
  event: RegistryEventType
  id: string
  visibility?: Visibility
  hash?: string
}

export interface PackageIndex {
  [id: string]: {
    visibility: Visibility
    deleted: boolean
    hash?: string
  }
}
