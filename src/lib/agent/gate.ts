import { NextResponse, type NextRequest } from 'next/server'
import { config } from '../config'
import { getAccess } from '../auth/access'
import { getPackageMeta } from '../storage/deployments'
import { normalizeIdentity } from './identity'
import type { PackageMeta } from '../storage/types'

/**
 * Who OpenTalon is told is speaking. Built here from the verified session, never from
 * the request body — the whole isolation story for the channel is that `userKey`
 * identifies a real principal, since OpenTalon derives the chatId from it.
 */
export interface AgentActor {
  userKey: string
  userLabel: string
  roles: string[]
}

export type AgentGateResult =
  | { ok: true; meta: PackageMeta; actor: AgentActor }
  | { ok: false; response: NextResponse }

/** Prefix for shared-secret callers, keeping their keyspace clear of real usernames. */
const SELF_DECLARED_PREFIX = 'talonpress:self:'
/** Where an unnamed shared-secret caller lands. Documented as shared. */
const ANONYMOUS_KEY = 'talonpress:shared-secret'

/**
 * Resolve the actor for a request.
 *
 * With an authz-proxy identity the subject is `username`, which the SDK documents as
 * equal to the user's email — stable across logins, which is what OpenTalon requires:
 * a key that rotates per session mints a new conversation every time.
 *
 * Shared-secret callers have no subject at all, so they name themselves (see
 * ./identity). A caller-supplied identity is honoured *only* on that path; when a real
 * identity exists it is ignored outright rather than allowed to override it.
 */
function resolveActor(
  access: { username: string | null; name: string | null; roles: string[]; via: string },
  claimedIdentity: unknown,
): AgentActor {
  if (access.username) {
    return {
      userKey: access.username,
      userLabel: access.name ?? access.username,
      roles: access.roles,
    }
  }

  const identity = normalizeIdentity(claimedIdentity)
  return {
    userKey: identity ? `${SELF_DECLARED_PREFIX}${identity}` : ANONYMOUS_KEY,
    userLabel: identity ?? 'TalonPress admin',
    roles: access.roles,
  }
}

function deny(status: number, error: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ error, ...extra }, { status })
}

/**
 * The single gate for every agent route.
 *
 * These routes sit under `/api/pub`, which `src/proxy.ts` treats as public by prefix,
 * so nothing upstream has checked anything by the time a request arrives here.
 *
 * A disabled channel answers 404 rather than 503: whether this deployment can talk to
 * an agent is not something an unauthenticated caller needs to learn.
 */
export async function resolveAgentRequest(
  request: NextRequest,
  packageId: string,
  claimedIdentity?: unknown,
): Promise<AgentGateResult> {
  if (!config.agentEnabled) {
    return { ok: false, response: deny(404, 'Not found') }
  }

  const meta = await getPackageMeta(packageId)
  if (!meta) {
    return { ok: false, response: deny(404, 'Not found') }
  }
  if (meta.disabled) {
    return { ok: false, response: deny(503, 'Package temporarily unavailable') }
  }

  const access = await getAccess(request)

  // Narrower than the bubble's own gate on purpose: a package token or package
  // session is enough to *read* a private package, but not to drive an agent that
  // can act on the operator's behalf. config.authEnabled is already implied by
  // agentEnabled; it is what stops an unconfigured deployment treating anonymous
  // callers as admins.
  if (!access.isAdmin) {
    if (!access.authenticated) {
      return { ok: false, response: deny(401, 'Unauthorized') }
    }
    return {
      ok: false,
      response: deny(403, 'Forbidden', {
        message: `The "${config.authzAdminRole}" role is required to chat about a package.`,
      }),
    }
  }

  return { ok: true, meta, actor: resolveActor(access, claimedIdentity) }
}

/**
 * The resource block describing what the reader is looking at.
 *
 * `id` is the package, never the page: OpenTalon derives the chatId from it, so
 * per-page ids would fork a new conversation on every navigation. The page travels on
 * `url` instead, which is per-request and outside the prompt-cached prefix.
 */
export function buildResource(
  meta: PackageMeta,
  filePath?: string,
): { id: string; title: string; url: string; visibility: string } {
  const base = `${config.publicBaseUrl}/pub/${meta.id}/`
  return {
    id: meta.id,
    title: meta.name,
    url: filePath ? `${base}${filePath.split('/').map(encodeURIComponent).join('/')}` : base,
    visibility: meta.visibility,
  }
}

/**
 * Validate a client-supplied page path against the package's own file list.
 *
 * Never accept a caller-supplied URL in its place: it would reach the model as the
 * reader's location, which makes it a way to point the agent at somewhere it should
 * not be looking.
 */
export function resolveFilePath(meta: PackageMeta, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return meta.defaultPage ?? null
  if (typeof raw !== 'string') return null
  const normalized = raw.replace(/^\/+/, '')
  return meta.files.includes(normalized) ? normalized : null
}
