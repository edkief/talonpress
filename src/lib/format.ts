/**
 * Human-readable byte size, e.g. 0 → "0 B", 1536 → "1.5 KB", 1048576 → "1 MB".
 * Uses binary (1024) units. Returns "—" for undefined sizes (e.g. legacy
 * packages whose size has not been backfilled yet).
 */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exp)
  const rounded = exp === 0 ? value : Math.round(value * 10) / 10
  return `${rounded} ${units[exp]}`
}
