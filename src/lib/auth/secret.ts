import crypto from 'crypto'

/** Constant-time string comparison to prevent timing attacks. */
export function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  try {
    const aBuf = Buffer.from(a)
    const bBuf = Buffer.from(b)
    if (aBuf.length !== bBuf.length) {
      // Same-length dummy comparison to keep timing consistent
      crypto.timingSafeEqual(aBuf, aBuf)
      return false
    }
    return crypto.timingSafeEqual(aBuf, bBuf)
  } catch {
    return false
  }
}
