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
 * One warn line per failed OpenTalon call.
 *
 * Every agent route answers a failure with a flat `{"error":"Agent unavailable"}` and
 * a 502, which is the right amount of detail for the browser and none at all for an
 * operator — so this is the only place the actual cause is recorded. Without it a 502
 * is indistinguishable from a refused connection, an expired secret, a timeout, or a
 * rejection from OpenTalon itself.
 *
 * `path` is logged with its query string stripped: the stream and messages routes
 * carry an OpenTalon stream token in theirs.
 */
export function logAgentFailure(path: string, detail: Record<string, unknown>): void {
  const fields = { path: path.split('?')[0], host: agentHost(), ...detail }
  const rendered = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${typeof value === 'string' ? JSON.stringify(value) : value}`)
  console.warn(`[talonpress] agent call failed ${rendered.join(' ')}`)
}

/** Host only — an agent URL is not supposed to carry credentials, but it may. */
function agentHost(): string {
  try {
    return new URL(config.agentBaseUrl).host
  } catch {
    return config.agentBaseUrl
  }
}

/**
 * Flatten a thrown fetch error into two fields.
 *
 * The distinction that matters is in the cause: undici reports every transport
 * failure as the same `TypeError: fetch failed` and hangs the real reason
 * (ECONNREFUSED, ENOTFOUND, a TLS failure) off `err.cause`. A timeout is the
 * exception — `AbortSignal.timeout` surfaces as `TimeoutError` with no cause, which
 * is how a 15s stall is told apart from an instant refusal.
 */
function describeFailure(err: unknown): { error: string; cause?: string } {
  if (!(err instanceof Error)) return { error: String(err) }
  const cause = err.cause
  if (!(cause instanceof Error)) return { error: `${err.name}: ${err.message}` }
  const code = (cause as NodeJS.ErrnoException).code
  return { error: `${err.name}: ${err.message}`, cause: `${code ?? cause.name}: ${cause.message}` }
}

/**
 * The one thing worth keeping out of a failed response body: whatever error string it
 * carries. Successful bodies hold conversation content and are never touched.
 *
 * Both halves are kept, because OpenTalon answers `{ error, message }` where `error`
 * is a coarse code and `message` is the part that actually identifies the problem —
 * a bare `forbidden` does not distinguish a role gate from a missing field.
 */
function upstreamHint(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  const parts = [record.error ?? record.code, record.message]
    .filter((part): part is string => typeof part === 'string' && part !== '')
  if (parts.length === 0) return undefined
  return [...new Set(parts)].join(': ').slice(0, 300)
}

/** A reader closing the tab aborts the relay's signal. Normal, and not worth a line. */
function isCallerAbort(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name
  return name === 'AbortError' || name === 'ResponseAborted'
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
  const started = Date.now()
  const res = await fetchAgent(path, init)
  let body: unknown = null
  let parseFailed = false
  try {
    body = await res.json()
  } catch {
    // A non-JSON error page from something in between. Callers only surface a
    // generic message anyway, so an unparseable body is not worth distinguishing —
    // except in the log, where "OpenTalon said no" and "an nginx in the middle said
    // no" are different problems.
    parseFailed = true
  }
  if (!res.ok) {
    logAgentFailure(path, {
      status: res.status,
      ms: Date.now() - started,
      upstream: upstreamHint(body),
      ...(parseFailed ? { note: 'non-JSON body' } : {}),
    })
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
export async function fetchAgent(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'X-Embed-Client': EMBED_CLIENT,
    'Authorization': `Bearer ${config.agentSecret}`,
    ...init.headers,
  }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'

  const started = Date.now()
  try {
    return await fetch(`${config.agentBaseUrl}/api/embed${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: init.signal ?? AbortSignal.timeout(config.agentTimeoutMs),
      cache: 'no-store',
    })
  } catch (err) {
    // Rethrown untouched — every caller already maps a throw to its own 502. This is
    // only here to record the reason on the way past.
    if (!isCallerAbort(err)) {
      logAgentFailure(path, { ...describeFailure(err), ms: Date.now() - started })
    }
    throw err
  }
}
