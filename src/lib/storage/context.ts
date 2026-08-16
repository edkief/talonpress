import { z } from 'zod'
import type { PackageContext } from './types'

/**
 * The write boundary for `PackageMeta.context`.
 *
 * Validation lives here rather than in `getPackageMeta()` on purpose: that function
 * is the single reader for every consumer, and it returns `null` on any throw, so a
 * schema failure there would turn one bad field into a 404 for the whole package —
 * including public `/pub` serving. Authors get a hard error when they write; readers
 * degrade gracefully instead (see `renderContextPayload`).
 *
 * The per-field limits are generous soft caps whose job is to give an MCP author a
 * clear error instead of silent truncation. The real budget is enforced once, at
 * render time, against the whole serialized payload.
 */
const FACT_VALUE = z.union([z.string(), z.number(), z.boolean()])

/**
 * Shape only, no size limits — for validating what comes back off disk. Stored data
 * can legitimately exceed today's limits (written under older ones, or by a hand
 * edit), and it is the render-time budget's job to cut it down, not this schema's.
 * Rejecting it here would throw away usable context over a length.
 */
export const packageContextReadSchema = z.object({
  summary: z.string().optional(),
  outline: z.array(z.string()).optional(),
  facts: z.record(z.string(), FACT_VALUE).optional(),
  excerpt: z.string().optional(),
  version: z.string().optional(),
  updatedAt: z.string().optional(),
})

/** Shape *and* size — for validating what an author is asking us to store. */
export const packageContextSchema = packageContextReadSchema.extend({
  summary: z.string().max(2000).optional(),
  outline: z.array(z.string().max(200)).max(64).optional(),
  facts: z.record(z.string().max(64), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
  excerpt: z.string().max(2000).optional(),
  version: z.string().max(64).optional(),
})

export class PackageContextError extends Error {}

/**
 * Validate and clean a caller-supplied context. Unknown keys are stripped (zod's
 * default), empty strings and empty collections are dropped so they never reach the
 * rendered payload as noise, and `updatedAt` is stamped by the caller — never here,
 * so this stays a pure function.
 *
 * Throws `PackageContextError` with a readable message when the input is invalid.
 */
export function normalizePackageContext(input: unknown): PackageContext {
  const parsed = packageContextSchema.safeParse(input)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    throw new PackageContextError(`Invalid package context — ${detail}`)
  }

  const { summary, outline, facts, excerpt, version, updatedAt } = parsed.data
  const cleanOutline = outline?.map(s => s.trim()).filter(Boolean)
  const cleanFacts = facts
    ? Object.fromEntries(Object.entries(facts).filter(([k]) => k.trim().length > 0))
    : undefined

  const out: PackageContext = {}
  if (summary?.trim()) out.summary = summary.trim()
  if (cleanOutline?.length) out.outline = cleanOutline
  if (cleanFacts && Object.keys(cleanFacts).length) out.facts = cleanFacts
  if (excerpt?.trim()) out.excerpt = excerpt.trim()
  if (version?.trim()) out.version = version.trim()
  if (updatedAt?.trim()) out.updatedAt = updatedAt.trim()
  return out
}

/** True when a normalized context carries nothing worth storing or rendering. */
export function isEmptyContext(ctx: PackageContext): boolean {
  return !ctx.summary && !ctx.outline?.length && !ctx.facts && !ctx.excerpt
}
