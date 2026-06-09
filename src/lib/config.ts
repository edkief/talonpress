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
  sharedSecret: (() => {
    if (process.env.TALONPRESS_SHARED_SECRET) return process.env.TALONPRESS_SHARED_SECRET
    if (process.env.OPENTALON_SHARED_SECRET) {
      console.warn(
        '[talonpress] OPENTALON_SHARED_SECRET is deprecated — rename it to TALONPRESS_SHARED_SECRET.',
      )
      return process.env.OPENTALON_SHARED_SECRET
    }
    return ''
  })(),
  authSessionTtl: envInt('AUTH_SESSION_TTL', 3600),
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:3000'),
  disableAuthWarning: env('TALONPRESS_DISABLE_AUTH_WARNING') === 'true',
  get authEnabled(): boolean {
    return this.sharedSecret.length > 0
  },
}

export type Config = typeof config
