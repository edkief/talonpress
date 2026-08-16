import { withAuthzProxy, type AuthzSession } from '@authz-proxy/sdk/next'
import { config } from '../config'

/**
 * Minimal request shape the SDK needs. Matches `NextRequest`, but is declared
 * structurally so this module can also be handed a plain `Request`.
 */
export interface AuthzRequestLike {
  headers: { get(name: string): string | null }
  cookies?: { get(name: string): { value: string } | undefined }
}

/**
 * authz-proxy integration, reverse-proxy mode.
 *
 * TalonPress runs *behind* authz-proxy: the proxy authenticates the user and
 * forwards the request with `X-Auth-Request-*` headers, including a signed RS256
 * JWT in `X-Auth-Request-JWT`. The SDK verifies that token locally against the
 * proxy's JWKS (`$AUTHZ_PROXY_URL/.well-known/jwks.json`) and hands back the
 * user's name and external role list.
 *
 * `tokenSources` is deliberately pinned to `x-auth-jwt` only:
 *   - `bearer` would make the SDK try to verify our own `Bearer <shared secret>`
 *     MCP credential as a JWT — it would fail, and a request holding a valid proxy
 *     header *plus* a shared-secret bearer would resolve as unauthenticated.
 *   - `nextauth-cookie` is for apps that share the proxy's NextAuth cookie; we
 *     don't, and it is not forwarded in reverse-proxy mode.
 */
const server = config.authzEnabled
  ? withAuthzProxy({
      proxyBaseUrl: config.authzProxyUrl || undefined,
      adminRoles: [config.authzAdminRole],
      tokenSources: ['x-auth-jwt'],
      roleSource: config.authzRoleSource,
    })
  : null

/**
 * Resolve the authz-proxy session, or `null` when the integration is disabled or
 * the proxy identity could not be resolved. Never throws: a misconfigured or
 * unreachable proxy degrades to "no authz identity" rather than a 500, leaving
 * the shared-secret path as the remaining way in.
 */
export async function getAuthzSession(req?: AuthzRequestLike): Promise<AuthzSession | null> {
  if (!server) return null
  try {
    const session = await server.getSession(req)
    return session.isAuthenticated ? session : null
  } catch (err) {
    console.warn('[talonpress] authz-proxy session resolution failed:', err)
    return null
  }
}
