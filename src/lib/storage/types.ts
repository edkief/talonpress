export interface FileInput {
  path: string
  content: string
}

export type Visibility = 'public' | 'private'

export interface PackageMeta {
  id: string
  name: string
  slug: string
  visibility: Visibility
  secure_token?: string
  hash: string
  files: string[]
  createdAt: string
  updatedAt: string
  deleted: boolean
}

export type RegistryEventType = 'publish' | 'update' | 'visibility' | 'delete'

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
