import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { PackageActions } from '@/components/PackageActions'
import { listPackages } from '@/lib/storage/deployments'
import { config } from '@/lib/config'

function IconGlobe({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 1.5c-2 2-3 4-3 6.5s1 4.5 3 6.5M8 1.5c2 2 3 4 3 6.5s-1 4.5-3 6.5M1.5 8h13" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}
function IconLock({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export const dynamic = 'force-dynamic'

export default async function PackagesPage() {
  const packages = await listPackages()

  return (
    <div className="az-shell">
      <Sidebar active="packages" />
      <main className="az-main">
        <header className="az-topbar">
          <h1 className="az-topbar-title">Packages</h1>
          <span style={{ fontSize: '0.8125rem', color: 'var(--fg3)' }}>
            {packages.length} total
          </span>
        </header>
        <div className="az-content">
          <div className="az-panel">
            <div className="az-table-wrap">
              {packages.length === 0 ? (
                <div className="az-empty">No packages found.</div>
              ) : (
                <table className="az-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Visibility</th>
                      <th>Files</th>
                      <th>Build hash</th>
                      <th>Created</th>
                      <th>Updated</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map(pkg => (
                      <tr key={pkg.id}>
                        <td style={{ fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Link href={`/packages/${pkg.id}`} style={{ color: 'var(--indigo-400)' }}>
                              {pkg.name}
                            </Link>
                            {pkg.disabled && (
                              <span className="az-badge az-badge--disabled">disabled</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`az-badge az-badge--${pkg.visibility}`}>
                            {pkg.visibility === 'public' ? <IconGlobe size={11} /> : <IconLock size={11} />}
                            {pkg.visibility}
                          </span>
                        </td>
                        <td className="az-text-muted">{pkg.files.length}</td>
                        <td>
                          <span className="az-tag az-mono">{pkg.hash.slice(0, 12)}</span>
                        </td>
                        <td className="az-text-muted az-text-sm">{formatDate(pkg.createdAt)}</td>
                        <td className="az-text-muted az-text-sm">{formatDate(pkg.updatedAt)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                            <a
                              href={`${config.publicBaseUrl}/pub/${pkg.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="az-btn az-btn--ghost az-btn--sm"
                            >
                              View
                            </a>
                            <PackageActions
                              id={pkg.id}
                              name={pkg.name}
                              fileCount={pkg.files.length}
                              disabled={pkg.disabled}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
