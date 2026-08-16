/**
 * Who a shared-secret caller says they are.
 *
 * The shared secret is a single all-or-nothing credential, so every holder resolves
 * to the same `Access` object. That is fine for authorization — they genuinely all
 * have the same rights — but it is not fine as a conversation key: one chatId for
 * every operator means they share a conversation *and its history*.
 *
 * So a shared-secret user names themselves, and that name selects which conversation
 * they get. Anyone holding the secret can claim any name; this is a way of keeping
 * separate people's chats apart, not a way of keeping anyone out. Authorization stays
 * with `access.isAdmin` and never consults this.
 *
 * authz-proxy deployments ignore all of this: they have a real, verified subject.
 */

/** localStorage key the login form writes and the chat bubble reads. */
export const IDENTITY_STORAGE_KEY = 'tp_agent_identity'

export const IDENTITY_MAX_LENGTH = 32

// Leading alphanumeric, then alphanumerics and a few separators. Deliberately narrow:
// this string is embedded in a chatId and shown to the agent as the user's label.
const IDENTITY_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/

/**
 * Normalise a self-declared name, or return `null` when it is unusable.
 * Case-insensitive, so "Ed" and "ed" resolve to the same conversation.
 */
export function normalizeIdentity(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  if (!IDENTITY_RE.test(trimmed)) return null
  return trimmed
}

/** Human-readable rule, shown in the login form and the chat bubble's prompt. */
export const IDENTITY_HINT =
  '2–32 characters: letters, digits, dot, dash or underscore, starting with a letter or digit.'
