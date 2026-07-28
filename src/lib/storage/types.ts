export interface FileInput {
  path: string
  content: string
  encoding?: 'utf8' | 'base64'
}

export type Visibility = 'public' | 'private'

export interface PackageMeta {
  id: string
  name: string
  slug: string
  visibility: Visibility
  secure_token?: string
  /** ISO timestamp of the most recent secure_token generation. Undefined for tokens generated before this field was tracked. */
  tokenGeneratedAt?: string
  defaultPage?: string
  hash: string
  files: string[]
  /** Total size of all package files in bytes. Recomputed on every (re)publish. */
  sizeBytes?: number
  createdAt: string
  updatedAt: string
  deleted: boolean
  disabled?: boolean
}

export type RegistryEventType = 'publish' | 'update' | 'visibility' | 'delete' | 'disable' | 'enable' | 'token_renew'

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
