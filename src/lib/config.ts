import path from 'path'

function env(key: string, fallback = ''): string {
  return process.env[key] ?? fallback
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key]
  if (!v) return fallback
  const n = parseInt(v, 10)
  return isNaN(n) ? fallback : n
}

export const config = {
  port: envInt('PORT', 3000),
  host: env('HOST', 'localhost'),
  storageDirPath: env('STORAGE_DIR_PATH') || path.join(process.cwd(), '.storage'),
  sharedSecret: env('OPENTALON_SHARED_SECRET'),
  authSessionTtl: envInt('AUTH_SESSION_TTL', 3600),
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:3000'),
  get authEnabled(): boolean {
    return this.sharedSecret.length > 0
  },
}

export type Config = typeof config
