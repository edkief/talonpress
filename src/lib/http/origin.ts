import { config } from '../config'

/**
 * CSRF guard for state-changing requests reached with ambient cookies.
 *
 * A missing `Origin` is allowed: non-browser clients (curl, probes) omit it, and
 * browsers always send it on the cross-origin requests this is guarding against.
 */
export function isSameOrigin(request: { headers: { get(name: string): string | null } }): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(config.publicBaseUrl).origin
  } catch {
    return false
  }
}
