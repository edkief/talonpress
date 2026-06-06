import crypto from 'crypto'
import { config } from '../config'

const COOKIE_NAME = 'tp_session'
const PKG_COOKIE_NAME = 'tp_pkg_session'
const SEPARATOR = '.'

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=')
      return [k.trim(), v.join('=')]
    }),
  )
}

function verifySignedData(raw: string): string | null {
  const lastDot = raw.lastIndexOf(SEPARATOR)
  if (lastDot === -1) return null
  const data = raw.slice(0, lastDot)
  const sig = raw.slice(lastDot + 1)
  const expected = sign(data, config.sharedSecret)
  try {
    const aBuf = Buffer.from(sig)
    const bBuf = Buffer.from(expected)
    if (aBuf.length !== bBuf.length) return null
    if (!crypto.timingSafeEqual(aBuf, bBuf)) return null
    return data
  } catch {
    return null
  }
}

interface SessionPayload {
  exp: number
}

interface PackageSessionPayload {
  packages: Record<string, number> // packageId → expiry unix timestamp
}

export function createSessionCookie(value: string = '1'): string {
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + config.authSessionTtl,
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = sign(data, config.sharedSecret)
  const cookieValue = `${data}${SEPARATOR}${sig}`

  const flags = [
    `${COOKIE_NAME}=${cookieValue}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${config.authSessionTtl}`,
  ]

  if (config.publicBaseUrl.startsWith('https://')) {
    flags.push('Secure')
  }

  return flags.join('; ')
}

export function verifySession(cookieHeader: string | null): boolean {
  if (!config.authEnabled) return true
  if (!cookieHeader) return false

  const raw = parseCookies(cookieHeader)[COOKIE_NAME]
  if (!raw) return false

  const data = verifySignedData(raw)
  if (!data) return false

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
    return Math.floor(Date.now() / 1000) < payload.exp
  } catch {
    return false
  }
}

function readPackageSession(cookieHeader: string | null): PackageSessionPayload {
  const empty: PackageSessionPayload = { packages: {} }
  if (!cookieHeader) return empty
  const raw = parseCookies(cookieHeader)[PKG_COOKIE_NAME]
  if (!raw) return empty
  const data = verifySignedData(raw)
  if (!data) return empty
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
  } catch {
    return empty
  }
}

export function verifyPackageSession(cookieHeader: string | null, packageId: string): boolean {
  const payload = readPackageSession(cookieHeader)
  const exp = payload.packages[packageId]
  if (!exp) return false
  return Math.floor(Date.now() / 1000) < exp
}

export function grantPackageSession(cookieHeader: string | null, packageId: string, ttlSeconds = 1800): string {
  const existing = readPackageSession(cookieHeader)
  const now = Math.floor(Date.now() / 1000)

  // Prune expired grants and add/refresh this package
  const packages: Record<string, number> = {}
  for (const [id, exp] of Object.entries(existing.packages)) {
    if (exp > now) packages[id] = exp
  }
  packages[packageId] = now + ttlSeconds

  const maxAge = Math.max(...Object.values(packages)) - now
  const payload: PackageSessionPayload = { packages }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const cookieValue = `${data}${SEPARATOR}${sign(data, config.sharedSecret)}`

  const flags = [
    `${PKG_COOKIE_NAME}=${cookieValue}`,
    `Path=/pub`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ]
  if (config.publicBaseUrl.startsWith('https://')) flags.push('Secure')
  return flags.join('; ')
}

export { COOKIE_NAME, PKG_COOKIE_NAME }
