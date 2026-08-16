import crypto from 'crypto'
import { config } from '../config'
import { packageContextReadSchema } from '../storage/context'
import type { PackageContext, PackageMeta } from '../storage/types'

/**
 * The page-context payload sent to OpenTalon.
 *
 * OpenTalon appends the rendered form of this to the *stable, prompt-cached* half of
 * its system prompt, keyed on `version`. Everything here must therefore be a pure
 * function of the package and its stored context: no timestamps, no message text, no
 * per-request state. Anything that varies per turn costs a full cache miss on every
 * single request, with no visible symptom beyond the bill.
 *
 * The page the reader is currently on deliberately does *not* live here — it travels
 * on `resource.url`, which is outside the cached prefix. Putting it here would mint a
 * new version on every navigation.
 */
export interface ContextPayload {
  version: string
  title: string
  url: string
  visibility: string
  summary?: string
  outline?: string[]
  facts?: Record<string, string | number | boolean>
  excerpt?: string
  updatedAt?: string
  /** Present when the cap forced content out, so the model knows to ask for more. */
  truncated?: string
}

/** Deterministic JSON: object keys sorted recursively, so equal values hash equal. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

/**
 * The cache key for a payload. Derived from the rendered content, never from the
 * package's file hash: a republish that leaves the context text alone must not evict
 * the cache, and a context edit that touches no file must.
 */
export function computeContextVersion(payload: Omit<ContextPayload, 'version'>): string {
  return crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex').slice(0, 16)
}

const TRUNCATION_NOTE =
  'Some context was omitted to fit the size budget. Read the package files directly for the rest.'

function payloadSize(p: Omit<ContextPayload, 'version'>): number {
  return canonicalJson(p).length
}

/**
 * Trim a payload to `maxChars` in a fixed order, so the result is a pure function of
 * the input rather than of how the budget happened to be reached.
 *
 * Order is cheapest-loss-first: the excerpt is one passage among many, the outline
 * tail matters less than its head, and the summary is the last thing worth keeping.
 * Idempotent by construction — running it on its own output changes nothing.
 */
function applyCap(
  payload: Omit<ContextPayload, 'version'>,
  maxChars: number,
): Omit<ContextPayload, 'version'> {
  if (payloadSize(payload) <= maxChars) return payload

  const out = { ...payload, truncated: TRUNCATION_NOTE }

  if (out.excerpt !== undefined) {
    delete out.excerpt
    if (payloadSize(out) <= maxChars) return out
  }

  while (out.outline && out.outline.length > 0) {
    out.outline = out.outline.slice(0, -1)
    if (out.outline.length === 0) delete out.outline
    if (payloadSize(out) <= maxChars) return out
  }

  if (out.summary !== undefined) {
    // Binary-search the longest prefix that fits, rather than assuming the overhead
    // around it is a fixed size.
    let lo = 0
    let hi = out.summary.length
    const full = out.summary
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      out.summary = `${full.slice(0, mid)}…`
      if (payloadSize(out) <= maxChars) lo = mid
      else hi = mid - 1
    }
    if (lo === 0) delete out.summary
    else out.summary = `${full.slice(0, lo)}…`
    if (payloadSize(out) <= maxChars) return out
  }

  const facts = out.facts
  if (facts) {
    for (const key of Object.keys(facts).sort()) {
      delete facts[key]
      if (Object.keys(facts).length === 0) delete out.facts
      if (payloadSize(out) <= maxChars) return out
    }
  }

  return out
}

/**
 * Derive a usable context for a package that has never had one set, so the agent is
 * never entirely blind. Purely structural — it describes the package's shape, and
 * claims nothing about what the package says.
 */
function deriveContext(meta: PackageMeta): PackageContext {
  const outline = meta.files.slice(0, 40)
  return {
    ...(outline.length ? { outline } : {}),
    facts: {
      fileCount: meta.files.length,
      ...(meta.defaultPage ? { defaultPage: meta.defaultPage } : {}),
    },
  }
}

/**
 * Build the payload for a package.
 *
 * Defensive on read: a stored context that fails validation is discarded in favour of
 * the derived one rather than throwing, because this sits on the request path for
 * every chat message and one bad field should not take the chat down. The write
 * boundary in storage/context.ts is where authors get told off.
 */
export function renderContextPayload(
  meta: PackageMeta,
  opts: { maxChars?: number } = {},
): ContextPayload {
  const maxChars = opts.maxChars ?? config.agentMaxContextChars

  let stored: PackageContext | undefined
  if (meta.context) {
    const parsed = packageContextReadSchema.safeParse(meta.context)
    if (parsed.success) {
      stored = parsed.data
    } else {
      console.warn(
        `[talonpress] package ${meta.id} has an unreadable context; falling back to a derived one`,
      )
    }
  }
  const ctx = stored ?? deriveContext(meta)

  const base: Omit<ContextPayload, 'version'> = {
    title: meta.name,
    // The package root, not the page being read: this string is part of the cached
    // prefix, so it must not move as the reader navigates.
    url: `${config.publicBaseUrl}/pub/${meta.id}/`,
    visibility: meta.visibility,
    ...(ctx.summary ? { summary: ctx.summary } : {}),
    ...(ctx.outline?.length ? { outline: ctx.outline } : {}),
    ...(ctx.facts && Object.keys(ctx.facts).length ? { facts: { ...ctx.facts } } : {}),
    ...(ctx.excerpt ? { excerpt: ctx.excerpt } : {}),
    ...(ctx.updatedAt ? { updatedAt: ctx.updatedAt } : {}),
  }

  const capped = applyCap(base, maxChars)

  // An author-pinned version wins verbatim: they own their own cache key.
  return { ...capped, version: stored?.version ?? computeContextVersion(capped) }
}
