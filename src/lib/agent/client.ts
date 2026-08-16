import { config } from '../config'

/**
 * The client id TalonPress identifies as on OpenTalon's embed channel.
 *
 * Deliberately a constant and not configurable: OpenTalon derives every chatId from
 * `clientId|resourceId|userKey`, so changing this silently orphans every existing
 * conversation on the instance rather than failing visibly.
 */
export const EMBED_CLIENT = 'talonpress'

if (config.agentBaseUrl && !config.authEnabled) {
  console.warn(
    '[talonpress] TALONPRESS_AGENT_URL is set but no auth is configured. The agent chat ' +
    'stays disabled: with neither TALONPRESS_SHARED_SECRET nor AUTHZ_PROXY_URL set, every ' +
    'anonymous caller resolves as an admin, and the chat would be open to anyone.',
  )
} else if (config.agentBaseUrl && !config.agentSecret) {
  console.warn(
    '[talonpress] TALONPRESS_AGENT_URL is set but TALONPRESS_AGENT_SECRET is empty — ' +
    'the agent chat stays disabled.',
  )
}

export interface AgentCallResult {
  ok: boolean
  status: number
  body: unknown
}

/**
 * Call an OpenTalon embed route.
 *
 * The shared secret is applied here and nowhere else, and no caller ever logs the
 * result of this function verbatim: the response body can carry conversation content,
 * and the request headers carry the credential.
 *
 * `path` is a fixed route string chosen by the caller — never anything derived from a
 * request — so there is no SSRF surface here.
 */
export async function callAgent(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<AgentCallResult> {
  const res = await fetchAgent(path, init)
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // A non-JSON error page from something in between. Callers only surface a
    // generic message anyway, so an unparseable body is not worth distinguishing.
  }
  return { ok: res.ok, status: res.status, body }
}

/**
 * The raw fetch, for callers that need the response object itself — the SSE relay
 * needs `res.body` as a stream rather than a parsed value.
 *
 * `cache: 'no-store'` is load-bearing, not decorative: Next's patched fetch buffers a
 * response into an ArrayBuffer when it considers it cacheable, which would hold a
 * stream until it closed.
 */
export function fetchAgent(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'X-Embed-Client': EMBED_CLIENT,
    'Authorization': `Bearer ${config.agentSecret}`,
    ...init.headers,
  }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'

  return fetch(`${config.agentBaseUrl}/api/embed${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: init.signal ?? AbortSignal.timeout(config.agentTimeoutMs),
    cache: 'no-store',
  })
}
