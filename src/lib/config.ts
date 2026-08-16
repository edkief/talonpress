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

  // authz-proxy (reverse-proxy mode). The proxy sits in front of TalonPress and
  // injects `X-Auth-Request-*` headers; the SDK verifies the RS256 JWT it carries
  // against the proxy's JWKS, giving us the user's name and external roles.
  authzProxyUrl: env('AUTHZ_PROXY_URL').replace(/\/$/, ''),
  authzAdminRole: env('TALONPRESS_ADMIN_ROLE', 'talonpress-admin'),
  // 'jwt' (default) verifies the proxy-issued token cryptographically.
  // 'header' trusts `X-Auth-Request-Email` / `-Role-List` verbatim — only safe when
  // the proxy is the sole ingress and strips client-supplied copies of those headers.
  authzRoleSource: env('AUTHZ_ROLE_SOURCE', 'jwt') === 'header' ? 'header' as const : 'jwt' as const,

  // OpenTalon embed channel. TalonPress proxies the browser's chat to OpenTalon's
  // /api/embed routes with this secret and asserts who the user is; OpenTalon is
  // never browser-facing, so the secret must never leave the server.
  agentBaseUrl: env('TALONPRESS_AGENT_URL').replace(/\/$/, ''),
  agentSecret: env('TALONPRESS_AGENT_SECRET'),
  agentTimeoutMs: envInt('TALONPRESS_AGENT_TIMEOUT_MS', 15000),
  // Budget for the rendered page-context block. Content past it is truncated with a
  // pointer rather than dropped silently.
  agentMaxContextChars: envInt('TALONPRESS_AGENT_MAX_CONTEXT_CHARS', 4000),

  // 'inherit' (default) gates /api/mcp with whatever auth is configured.
  // 'none' opts the MCP transport out entirely, for clusters where MCP clients
  // reach the pod over an internal Service that never passes through the proxy.
  mcpAuthMode: env('TALONPRESS_MCP_AUTH', 'inherit') === 'none' ? 'none' as const : 'inherit' as const,

  /** True when the legacy `Bearer <shared secret>` / `/auth` login path is configured. */
  get sharedSecretEnabled(): boolean {
    return this.sharedSecret.length > 0
  },
  /** True when identities can be resolved from the authz-proxy. */
  get authzEnabled(): boolean {
    // 'header' mode needs no JWKS, so a proxy URL is not required for it.
    return this.authzProxyUrl.length > 0 || this.authzRoleSource === 'header'
  },
  /** True when *some* access control is configured. When false, everything is open. */
  get authEnabled(): boolean {
    return this.sharedSecretEnabled || this.authzEnabled
  },
  /** Whether /api/mcp enforces auth. Independent of the dashboard gate. */
  get mcpAuthEnabled(): boolean {
    return this.mcpAuthMode !== 'none' && this.authEnabled
  },
  /**
   * Whether the embedded agent chat is available.
   *
   * `authEnabled` is required here rather than at each call site: with no auth
   * configured `getAccess()` reports every anonymous caller as an admin, so an
   * unconfigured deployment would otherwise hand the agent to anyone who could
   * reach it. Gating in one place means the chat fails closed by construction.
   */
  get agentEnabled(): boolean {
    return this.agentBaseUrl.length > 0 && this.agentSecret.length > 0 && this.authEnabled
  },
}

export type Config = typeof config
