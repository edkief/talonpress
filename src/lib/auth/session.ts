import crypto from 'crypto'
import { config } from '../config'

const COOKIE_NAME = 'tp_session'
const SEPARATOR = '.'

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

interface SessionPayload {
  exp: number
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
  if (!cookieHeader || !config.authEnabled) return !config.authEnabled

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=')
      return [k.trim(), v.join('=')]
    }),
  )

  const raw = cookies[COOKIE_NAME]
  if (!raw) return false

  const lastDot = raw.lastIndexOf(SEPARATOR)
  if (lastDot === -1) return false

  const data = raw.slice(0, lastDot)
  const sig = raw.slice(lastDot + 1)
  const expected = sign(data, config.sharedSecret)

  // Constant-time comparison
  try {
    const aBuf = Buffer.from(sig)
    const bBuf = Buffer.from(expected)
    if (aBuf.length !== bBuf.length) return false
    if (!crypto.timingSafeEqual(aBuf, bBuf)) return false
  } catch {
    return false
  }

  let payload: SessionPayload
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
  } catch {
    return false
  }

  return Math.floor(Date.now() / 1000) < payload.exp
}

export { COOKIE_NAME }
