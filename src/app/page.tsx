import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { listPackages } from '@/lib/storage/deployments'
import { config } from '@/lib/config'

function IconPackage({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M13.5 4.5l-5.5-3-5.5 3v7l5.5 3 5.5-3v-7z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M2.5 4.5L8 7.5l5.5-3M8 7.5V14.5" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  )
}

function IconGlobe({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 1.5c-2 2-3 4-3 6.5s1 4.5 3 6.5M8 1.5c2 2 3 4 3 6.5s-1 4.5-3 6.5M1.5 8h13" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

function IconLock({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const packages = await listPackages()
  const publicCount = packages.filter(p => p.visibility === 'public').length
  const privateCount = packages.filter(p => p.visibility === 'private').length

  return (
    <div className="az-shell">
      <Sidebar active="dashboard" />
      <main className="az-main">
        <header className="az-topbar">
          <h1 className="az-topbar-title">Dashboard</h1>
          <span style={{ fontSize: '0.8125rem', color: 'var(--fg3)' }}>
            {config.publicBaseUrl}
          </span>
        </header>

        <div className="az-content">
          {!config.authEnabled && (
            <div className="az-banner az-banner--warning">
              <svg className="az-banner__icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5L14.5 13.5H1.5L8 1.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
              </svg>
              <div>
                <div className="az-banner__title">Authentication disabled</div>
                <div className="az-banner__body">
                  <code>OPENTALON_SHARED_SECRET</code> is not set. The MCP API and dashboard are open to unauthenticated requests. Set the variable and restart the server to enable access control.
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="az-stats-grid">
            <div className="az-stat">
              <div className="az-stat-icon az-stat-icon--indigo-dark">
                <IconPackage size={20} />
              </div>
              <div>
                <div className="az-stat-value">{packages.length}</div>
                <div className="az-stat-label">Total packages</div>
              </div>
            </div>
            <div className="az-stat">
              <div className="az-stat-icon az-stat-icon--emerald-dark">
                <IconGlobe size={20} />
              </div>
              <div>
                <div className="az-stat-value">{publicCount}</div>
                <div className="az-stat-label">Public</div>
              </div>
            </div>
            <div className="az-stat">
              <div className="az-stat-icon az-stat-icon--amber-dark">
                <IconLock size={20} />
              </div>
              <div>
                <div className="az-stat-value">{privateCount}</div>
                <div className="az-stat-label">Private</div>
              </div>
            </div>
          </div>

          {/* Packages table */}
          <div className="az-panel">
            <div className="az-panel-header">
              <h2 className="az-panel-title">Packages</h2>
              <span style={{ fontSize: '0.8125rem', color: 'var(--fg3)' }}>
                {packages.length} total
              </span>
            </div>
            <div className="az-table-wrap">
              {packages.length === 0 ? (
                <div className="az-empty">
                  No packages published yet. Use the MCP tools to publish your first package.
                </div>
              ) : (
                <table className="az-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>ID</th>
                      <th>Visibility</th>
                      <th>Files</th>
                      <th>Updated</th>
                      <th>Access URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map(pkg => (
                      <tr key={pkg.id}>
                        <td>
                          <Link
                            href={`/packages/${pkg.id}`}
                            style={{ color: 'var(--indigo-400)', fontWeight: 500 }}
                          >
                            {pkg.name}
                          </Link>
                        </td>
                        <td>
                          <span className="az-tag az-mono">{pkg.id}</span>
                        </td>
                        <td>
                          <span className={`az-badge az-badge--${pkg.visibility}`}>
                            {pkg.visibility === 'public' ? <IconGlobe size={11} /> : <IconLock size={11} />}
                            {pkg.visibility}
                          </span>
                        </td>
                        <td className="az-text-muted">{pkg.files.length}</td>
                        <td className="az-text-muted az-text-sm">{formatDate(pkg.updatedAt)}</td>
                        <td>
                          <a
                            href={`${config.publicBaseUrl}/pub/${pkg.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="az-text-sm"
                            style={{ color: 'var(--indigo-400)' }}
                          >
                            /pub/{pkg.id}
                          </a>
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
