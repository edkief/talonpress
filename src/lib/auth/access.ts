import { config } from '../config'
import { timingSafeCompare } from './secret'
import { verifySession } from './session'
import { getAuthzSession, type AuthzRequestLike } from './authz'

/** How the caller proved who they are. */
export type AccessVia =
  | 'open' // no access control configured at all
  | 'authz' // identity forwarded by authz-proxy
  | 'session-cookie' // legacy `/auth` login with the shared secret
  | 'shared-secret' // `Authorization: Bearer <shared secret>`
  | 'none'

export interface Access {
  /** The caller proved *some* identity (or auth is entirely unconfigured). */
  authenticated: boolean
  /** The caller may use the management UI and mutate packages. */
  isAdmin: boolean
  /** Display name, when the identity carries one (authz-proxy only). */
  name: string | null
  /** Canonical username / email, when known. */
  username: string | null
  /** External role names from authz-proxy ([] for shared-secret callers). */
  roles: string[]
  via: AccessVia
}

const OPEN: Access = {
  authenticated: true,
  isAdmin: true,
  name: null,
  username: null,
  roles: [],
  via: 'open',
}

const DENIED: Access = {
  authenticated: false,
  isAdmin: false,
  name: null,
  username: null,
  roles: [],
  via: 'none',
}

function bearerToken(req?: AuthzRequestLike): string {
  if (!req) return ''
  const header = req.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

/**
 * The `cookie` header for this request. Route handlers and the proxy pass `req`;
 * Server Components have no request object, so fall back to `next/headers`. The
 * import is dynamic so this module stays usable outside the RSC runtime.
 */
async function cookieHeader(req?: AuthzRequestLike): Promise<string | null> {
  if (req) return req.headers.get('cookie')
  try {
    const { headers } = await import('next/headers')
    return (await headers()).get('cookie')
  } catch {
    return null
  }
}

/**
 * Resolve who is making this request across every mechanism TalonPress supports.
 *
 * The two mechanisms are complementary rather than competing:
 *   - **authz-proxy** carries real human identity (name + roles) for browser
 *     traffic, and is what grants admin via `TALONPRESS_ADMIN_ROLE`.
 *   - **the shared secret** stays the machine credential: MCP clients and CLI
 *     automation cannot complete an interactive sign-in, so `Bearer <secret>`
 *     (and the `/auth` cookie it issues) remains a full-access path.
 *
 * They are OR-ed: whichever mechanism recognises the caller wins. When *neither*
 * is configured the app is open, preserving the previous unconfigured behaviour.
 *
 * Pass `req` from route handlers and the proxy; omit it inside Server Components
 * and Server Actions, where the SDK reads the incoming headers itself.
 */
export async function getAccess(req?: AuthzRequestLike): Promise<Access> {
  if (!config.authEnabled) return OPEN

  const authz = await getAuthzSession(req)

  // The shared-secret paths only exist when a secret is configured. Both grant
  // full access — the secret has always been an all-or-nothing admin credential.
  let secretVia: AccessVia | null = null
  if (config.sharedSecretEnabled) {
    if (verifySession(await cookieHeader(req))) {
      secretVia = 'session-cookie'
    } else if (timingSafeCompare(bearerToken(req), config.sharedSecret)) {
      secretVia = 'shared-secret'
    }
  }

  if (authz) {
    return {
      authenticated: true,
      // `roleSource: 'header'` yields no display name, so fall back to the username.
      isAdmin: authz.isAdmin || secretVia !== null,
      name: authz.name ?? authz.username,
      username: authz.username,
      roles: authz.roles,
      via: 'authz',
    }
  }

  if (secretVia) {
    return { ...OPEN, via: secretVia }
  }

  return DENIED
}
